let video = null
let remoteAction = false

function findVideo() {
  let el = document.querySelector('video')
  if (!el) {
    try {
      const iframes = document.querySelectorAll('iframe')
      for (const f of iframes) {
        try {
          el = f.contentDocument?.querySelector('video')
          if (el) break
        } catch {}
      }
    } catch {}
  }
  return el
}

function onPlay() {
  if (remoteAction) { remoteAction = false; return }
  if (video.readyState === 0) return
  chrome.runtime.sendMessage({ type: 'PLAY', time: video.currentTime })
}

function onPause() {
  if (remoteAction) { remoteAction = false; return }
  chrome.runtime.sendMessage({ type: 'PAUSE', time: video.currentTime })
}

function onSeeked() {
  if (remoteAction) { remoteAction = false; return }
  chrome.runtime.sendMessage({ type: 'SEEK', time: video.currentTime })
}

function attach() {
  if (video) {
    video.removeEventListener('play', onPlay)
    video.removeEventListener('pause', onPause)
    video.removeEventListener('seeked', onSeeked)
  }
  video = findVideo()
  if (video) {
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('seeked', onSeeked)
    chrome.runtime.sendMessage({ type: 'VIDEO_FOUND' })
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!video) return
  switch (msg.type) {
    case 'REMOTE_PLAY':
      remoteAction = true
      video.currentTime = msg.time
      video.play().catch(() => { remoteAction = false })
      break
    case 'REMOTE_PAUSE':
      remoteAction = true
      video.currentTime = msg.time
      video.pause();
      (() => { setTimeout(() => { remoteAction = false }, 50) })()
      break
    case 'REMOTE_SEEK':
      remoteAction = true
      video.currentTime = msg.time;
      (() => { setTimeout(() => { remoteAction = false }, 50) })()
      break
    case 'REMOTE_STATE':
      remoteAction = true
      video.currentTime = msg.time
      if (msg.playing) {
        video.play().catch(() => { remoteAction = false })
      } else {
        video.pause();
        (() => { setTimeout(() => { remoteAction = false }, 50) })()
      }
      break
    case 'REMOTE_RESET':
      remoteAction = true
      video.pause()
      video.currentTime = 0
      setTimeout(() => { remoteAction = false }, 50)
      break
    case 'STATUS':
      break
  }
})

const poll = setInterval(() => {
  const el = findVideo()
  if (el !== video) { attach(); if (video) clearInterval(poll) }
}, 1000)

attach()
setTimeout(() => clearInterval(poll), 30000)
