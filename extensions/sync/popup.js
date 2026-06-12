const $ = (id) => document.getElementById(id)

let statusListener = null

function show(selector) { document.querySelectorAll('#noRoom, #inRoom, #errorMsg').forEach(el => el.classList.add('hidden')); const el = selector instanceof HTMLElement ? selector : $(selector); if (el) el.classList.remove('hidden') }

function getStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resolve)
  })
}

function updateUI(status) {
  const dot = $('statusDot')
  dot.className = 'dot ' + (status.connected ? 'online' : 'offline')

  if (status.room) {
    show('inRoom')
    $('roomCodeDisplay').textContent = status.room
    $('roleBadge').textContent = status.role === 'host' ? 'Host' : 'Viewer'
    $('roleBadge').className = 'role-badge ' + (status.role === 'host' ? 'host' : 'viewer')
  } else {
    show('noRoom')
  }

  if (status.config && status.config.serverUrl) {
    $('serverInput').value = status.config.serverUrl
  }
}

function setError(msg) {
  $('errorMsg').textContent = msg
  show('errorMsg')
}

$('createBtn').addEventListener('click', async () => {
  $('createBtn').disabled = true
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || ''
    chrome.runtime.sendMessage({ type: 'CREATE_ROOM', url }, (res) => {
      $('createBtn').disabled = false
      if (res.ok) {
        $('roomCodeDisplay').textContent = res.code
        updateUI({ connected: true, room: res.code, role: 'host' })
      } else {
        setError('Failed to create room')
      }
    })
  })
})

$('joinBtn').addEventListener('click', () => {
  const code = $('codeInput').value.trim().toLowerCase()
  if (!code || code.length !== 6) { setError('Enter a 6-character room code'); return }
  $('joinBtn').disabled = true
  chrome.runtime.sendMessage({ type: 'JOIN_ROOM', code }, (res) => {
    $('joinBtn').disabled = false
    if (res.ok) {
      $('roomCodeDisplay').textContent = code
      updateUI({ connected: true, room: code, role: 'viewer' })
    } else {
      setError(res.err || 'Failed to join room')
    }
  })
})

$('copyBtn').addEventListener('click', () => {
  const code = $('roomCodeDisplay').textContent
  navigator.clipboard.writeText(code).then(() => {
    $('copyBtn').textContent = '✓'
    setTimeout(() => { $('copyBtn').textContent = '📋' }, 1500)
  })
})

$('leaveBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LEAVE_ROOM' }, () => {
    $('codeInput').value = ''
    updateUI({ connected: true, room: null })
  })
})

$('serverInput').addEventListener('change', () => {
  const url = $('serverInput').value.trim()
  chrome.storage.local.set({ serverUrl: url })
  chrome.runtime.sendMessage({ type: 'CONFIG', config: { serverUrl: url } })
})

// Real-time status updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS') {
    updateUI(msg)
  }
  if (msg.type === 'COUNT') {
    $('viewerCount').textContent = msg.count
  }
})

getStatus().then(updateUI)
