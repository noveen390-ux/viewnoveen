self.importScripts('socket.io.min.js')

let socket = null
let roomCode = null
let userName = 'User_' + Math.random().toString(36).slice(2, 6)
let role = null
let sessionTabId = null
let isConnected = false
let lastState = { p: true, t: 0 }
let config = { serverUrl: 'http://localhost:3000' }

function connect() {
  if (socket && socket.connected) return
  socket = io(config.serverUrl, { transports: ['websocket', 'polling'] })

  socket.on('connect', () => {
    isConnected = true
    updateBadge()
    pushToContent({ type: 'STATUS', connected: true, room: roomCode, role })
  })

  socket.on('disconnect', () => {
    isConnected = false
    updateBadge()
    pushToContent({ type: 'STATUS', connected: false })
  })

  socket.on('play', (time) => { lastState = { p: true, t: time }; pushToContent({ type: 'REMOTE_PLAY', time }) })
  socket.on('pause', (time) => { lastState = { p: false, t: time }; pushToContent({ type: 'REMOTE_PAUSE', time }) })
  socket.on('seek', (time) => { lastState.t = time; pushToContent({ type: 'REMOTE_SEEK', time }) })
  socket.on('sync-state', (s) => { lastState = s; pushToContent({ type: 'REMOTE_STATE', time: s.t, playing: !s.p }) })
  socket.on('state', (s) => { lastState = s; pushToContent({ type: 'REMOTE_STATE', time: s.t, playing: !s.p }) })
  socket.on('count', (n) => pushToContent({ type: 'COUNT', count: n }))
  socket.on('reset', () => { lastState = { p: true, t: 0 }; pushToContent({ type: 'REMOTE_RESET' }) })
}

function pushToContent(msg) {
  if (sessionTabId != null) {
    chrome.tabs.sendMessage(sessionTabId, msg).catch(() => {})
  }
}

function updateBadge() {
  const text = isConnected ? (roomCode ? roomCode.slice(0, 4) : 'ON') : ''
  const color = isConnected ? '#22c55e' : '#ef4444'
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null

  switch (msg.type) {
    case 'CONFIG':
      Object.assign(config, msg.config)
      if (socket) { socket.close(); socket = null }
      connect()
      sendResponse({ ok: true })
      break

    case 'GET_STATUS':
      sendResponse({ connected: isConnected, room: roomCode, role, config })
      break

    case 'CREATE_ROOM':
      if (!socket) connect()
      sessionTabId = tabId
      socket.emit('create', (res) => {
        roomCode = res.code
        role = 'host'
        socket.emit('meta', { source: 'extension', url: msg.url || '' })
        updateBadge()
        pushToContent({ type: 'STATUS', connected: true, room: roomCode, role })
        sendResponse({ ok: true, code: roomCode })
      })
      return true

    case 'JOIN_ROOM':
      if (!socket) connect()
      sessionTabId = tabId
      socket.emit('join', { c: msg.code, n: userName }, (res) => {
        if (res.ok) {
          roomCode = msg.code
          role = 'viewer'
          updateBadge()
          pushToContent({ type: 'STATUS', connected: true, room: roomCode, role })
          sendResponse({ ok: true })
        } else {
          sendResponse({ ok: false, err: res.err })
        }
      })
      return true

    case 'LEAVE_ROOM':
      roomCode = null; role = null; sessionTabId = null
      updateBadge()
      pushToContent({ type: 'STATUS', connected: isConnected, room: null, role: null })
      sendResponse({ ok: true })
      break

    case 'VIDEO_FOUND':
      if (roomCode && sender.tab && sender.tab.id === sessionTabId) {
        chrome.tabs.sendMessage(sender.tab.id, { type: 'REMOTE_STATE', time: lastState.t, playing: !lastState.p }).catch(() => {})
      }
      break

    case 'PLAY':
    case 'PAUSE':
    case 'SEEK':
      if (socket && roomCode && tabId === sessionTabId) {
        socket.emit(msg.type.toLowerCase(), msg.time)
      }
      break
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === sessionTabId) {
    roomCode = null; role = null; sessionTabId = null
    lastState = { p: true, t: 0 }
    updateBadge()
  }
})

chrome.storage.local.get(['serverUrl', 'userName'], (result) => {
  if (result.serverUrl) config.serverUrl = result.serverUrl
  if (result.userName) userName = result.userName
  connect()
})
