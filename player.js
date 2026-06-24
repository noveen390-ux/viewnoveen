// ==================== DOM ====================
const $ = (id) => document.getElementById(id);
const video = $("video");
// Unmute on user interaction (recovery from muted autoplay)
(function() {
  function _ensureAudio() {
    if (playerType && playerType !== "youtube" && video.muted) video.muted = false;
  }
  document.addEventListener('click', _ensureAudio);
  document.addEventListener('touchstart', _ensureAudio);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') _ensureAudio();
  });
})();
// Wrap play() to retry with muted on autoplay rejection
(function() {
  var _origPlay = video.play.bind(video);
  video.play = function() {
    var p = _origPlay();
    if (p && typeof p.catch === 'function') {
      return p.catch(function(e) {
        video.muted = true;
        return _origPlay().catch(function() {});
      });
    }
    return p;
  };
})();
const seekbar = $("seekbar");
const timeDisplay = $("timeDisplay");
const playBtn = $("playBtn");
const liveBadge = $("liveBadge");
const createBtn = $("createBtn");
const joinBtn = $("joinBtn");

// Video debug logging
["loadstart", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "play", "playing", "pause", "waiting", "stalled", "suspend", "abort", "emptied", "seeked", "seeking", "durationchange", "progress", "ratechange"].forEach(function(e) {
  video.addEventListener(e, function() {
    console.log("[video] " + e + (e === "loadedmetadata" ? " d:" + video.duration + " " + video.videoWidth + "x" + video.videoHeight : ""));
  });
});
video.addEventListener("error", function() {
  var err = video.error;
  console.log("[video] error:", err ? err.code + " - " + err.message : "unknown");
});

let _directStallTimer = null;
video.addEventListener("waiting", function() {
  if (playerType !== "direct") return;
  if (_directStallTimer) clearTimeout(_directStallTimer);
  if ($("waitOverlay").classList.contains("hidden") && !bufMgr.isRebuffering && !bufMgr.isStartupBuffering) {
    $("waitOverlay").classList.remove("hidden");
    $("waitMsg").textContent = "Buffering...";
  }
  var stalledCt = video.currentTime;
  _directStallTimer = setTimeout(function() {
    if (playerType !== "direct") return;
    if (video.paused || video.ended) return;
    if (Math.abs(video.currentTime - stalledCt) < 0.5) {
      video.play().catch(function() {});
    }
  }, 5000);
});
video.addEventListener("playing", function() {
  if (_directStallTimer) {
    clearTimeout(_directStallTimer); _directStallTimer = null;
  }
  if (playerType === "direct" && !$("waitOverlay").classList.contains("hidden") && !bufMgr.isStartupBuffering && !bufMgr.isRebuffering) {
    $("waitOverlay").classList.add("hidden");
  }
});
video.addEventListener("seeked", function() {
  if (_directStallTimer) {
    clearTimeout(_directStallTimer); _directStallTimer = null;
  }
});

// ==================== BUFFER MANAGER ====================
function getBufferAhead() {
  const b = video.buffered;
  const ct = video.currentTime;
  for (let i = 0; i < b.length; i++) {
    if (ct >= b.start(i) && ct <= b.end(i)) {
      return b.end(i) - ct;
    }
  }
  return 0;
}

var _startupCanPlayThrough = null;
function waitForStartupBuffer(callback) {
  var _st = playerType;
  if (_st !== 'localstream' && _st !== 'direct') {
    callback(); return;
  }
  bufMgr.isStartupBuffering = true;
  var _minBuf = _st === 'direct' ? bufMgr.directStartupMinBuf : bufMgr.startupMinBuf;
  console.log('[buffer] startup: waiting for ' + _minBuf + 's buffered (' + _st + ')');

  if (_startupCanPlayThrough) video.removeEventListener('canplaythrough', _startupCanPlayThrough);
  _startupCanPlayThrough = function () {
    video.removeEventListener('canplaythrough', _startupCanPlayThrough);
    _startupCanPlayThrough = null;
    if (!bufMgr.isStartupBuffering) return;
    bufMgr.isStartupBuffering = false;
    console.log('[buffer] startup: canplaythrough, proceeding');
    callback();
  };
  video.addEventListener('canplaythrough', _startupCanPlayThrough);

  const check = function () {
    if (!bufMgr.isStartupBuffering) return;
    const ahead = getBufferAhead();
    if (ahead >= _minBuf || video.readyState >= 3) {
      bufMgr.isStartupBuffering = false;
      if (_startupCanPlayThrough) {
        video.removeEventListener('canplaythrough', _startupCanPlayThrough); _startupCanPlayThrough = null;
      }
      console.log('[buffer] startup: ready (' + ahead.toFixed(1) + 's)');
      callback();
      return;
    }
    console.log('[buffer] startup: ' + ahead.toFixed(1) + 's / ' + _minBuf + 's');
    requestAnimationFrame(check);
  };

  setTimeout(function () {
    if (bufMgr.isStartupBuffering) {
      bufMgr.isStartupBuffering = false;
      if (_startupCanPlayThrough) {
        video.removeEventListener('canplaythrough', _startupCanPlayThrough); _startupCanPlayThrough = null;
      }
      console.log('[buffer] startup: timeout, proceeding');
      callback();
    }
  }, 15000);

  check();
}

function startBufferMonitor() {
  if (playerType !== 'localstream' && playerType !== 'direct') return;
  var _st = playerType;
  var _criticalLow = _st === 'direct' ? bufMgr.directCriticalLow : bufMgr.criticalLow;
  var _safeResume = _st === 'direct' ? bufMgr.directSafeResume : bufMgr.safeResume;
  console.log('[buffer] monitor started (' + _st + ')');

  function check() {
    if (playerType !== _st) return;
    if (video.paused || bufMgr.isRebuffering) {
      requestAnimationFrame(check);
      return;
    }
    var ahead = getBufferAhead();
    if (ahead < _criticalLow) {
      var now = Date.now();
      bufMgr.consecutiveStalls++;
      bufMgr.lastStallTime = now;
      var resumeThreshold = _safeResume * Math.min(bufMgr.consecutiveStalls, 3);
      console.log('[buffer] CRITICAL: ' + ahead.toFixed(1) + 's ahead, pausing (stall #' + bufMgr.consecutiveStalls + ', resume at ' + resumeThreshold + 's)');
      bufMgr.isRebuffering = true;
      _bufferPause = true;
      video.pause();
      if (_st === 'direct') {
        $("waitOverlay").classList.remove("hidden");
        $("waitMsg").textContent = "Buffering...";
      }

      function rebuild() {
        if (playerType !== _st) {
          bufMgr.isRebuffering = false; return;
        }
        var nowAhead = getBufferAhead();
        if (nowAhead >= resumeThreshold || video.readyState >= 3) {
          bufMgr.isRebuffering = false;
          socket.emit("sync-request");
          clearTimeout(bufMgr._stallTimer);
          bufMgr._stallTimer = setTimeout(function () {
            bufMgr.consecutiveStalls = 0;
            console.log('[buffer] stall counter reset');
          }, bufMgr.stallCooldown);
          if (_st === 'direct') {
            $("waitOverlay").classList.add("hidden");
          }
          return;
        }
        console.log('[buffer] rebuilding: ' + nowAhead.toFixed(1) + 's / ' + resumeThreshold + 's');
        requestAnimationFrame(rebuild);
      }
      rebuild();
    }
    requestAnimationFrame(check);
  }
  check();
}

// ==================== CHANGE VIDEO ====================
function directBack() {
  if (!isHost) return;
  if (playerType === "direct") {
    changeVideo(); return;
  }
  $("directSection").classList.add("hidden");
  $("uploadArea").classList.remove("hidden");
  $("waitOverlay").classList.add("hidden");
  liveBadge.classList.add("hidden");
  $("directInput").value = "";
  selectSource("upload");
  $("uploadStatus").textContent = "MP4, MKV, WebM, MOV";
}

function changeVideo() {
  if (!isHost) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  destroyYTPlayer();
  if (syncTimer) {
    clearInterval(syncTimer); syncTimer = null;
  }
  video.pause();
  video.src = "";
  video.load();
  videoMeta = null;
  proxyMode = false;
  proxyBuffer = null;
  totalChunks = 0;
  chunkBuf = [];
  useFallback = false;
  ms = null;
  sb = null;
  chunkQ = [];
  appending = false;
  localSeek = false;
  playerType = null;
  pendingState = null;
  directPlaying = false;
  bufMgr.isStartupBuffering = false;
  bufMgr.isRebuffering = false;
  bufMgr.consecutiveStalls = 0;
  clearTimeout(bufMgr._stallTimer);
  if (_directStallTimer) {
    clearTimeout(_directStallTimer); _directStallTimer = null;
  }
  directTime = 0;
  _playEmitLast = 0;
  _pauseEmitLast = 0;
  _lastAppliedSeq = -1;
  _pendingHostPlay = false;
  _lastSyncTargetT = -1;
  _lastSyncTime = 0;
  _rttSamples = [];
  _estRTT = 0;
  _minRTT = Infinity;
  _clockOffsetSamples = [];
  _serverClockOffset = 0;
  _syncWatchdogArmed = false;
  if (_syncWatchdogTimer) {
    clearTimeout(_syncWatchdogTimer); _syncWatchdogTimer = null;
  }
  removeSubtitle();
  if (window.hlsInstance) {
    window.hlsInstance.destroy(); window.hlsInstance = null;
  }
  if (dashPlayer) {
    try {
      dashPlayer.reset();
    } catch (e) {} dashPlayer = null;
  }
  socket.emit("reset");
  $("controls").classList.remove("show");
  $("changeBtn").classList.add("hidden");
  $("playerArea").classList.add("hidden");
  $("youtubePlayer").classList.add("hidden");
  $("directIframe").classList.add("hidden");
  $("directIframe").src = "";
  if (_blobUrl) {
    URL.revokeObjectURL(_blobUrl); _blobUrl = null;
  }
  video.classList.remove("hidden");
  $("playBtn").classList.remove("hidden");
  $("seekbar").classList.remove("hidden");
  $("timeDisplay").classList.remove("hidden");
  $("uploadArea").classList.remove("hidden");
  $("uploadStatus").textContent = "MP4, MKV, WebM, MOV";
  liveBadge.classList.add("hidden");
  if (iptvChannels.length) {
    $("iptvSearchInput").classList.remove("hidden"); selectSource("iptv");
  } else {
    selectSource("upload");
  }
  $("fileInput").value = "";
  $("youtubeInput").value = "";
  $("driveInput").value = "";
  $("directInput").value = "";
  $("localStreamInput").value = "";
  $("localStreamProgress").classList.add("hidden");
  $("localStreamFileName").textContent = "";
  if (torrentClient && torrentObj) {
    torrentObj.destroy(); torrentObj = null;
  }
  scheduleOverlayTimeout();
}
// ==================== FULLSCREEN ====================
function resetFsControlsTimer() {
  if (window.innerWidth <= 768) return;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
  const el = $("controls");
  if (!el) return;
  if ($("fsChatPanel").classList.contains("show")) return;
  el.classList.add("show");
  clearTimeout(_fsControlsTimer);
  _fsControlsTimer = setTimeout(function() {
    el.classList.remove("show");
  }, 3000);
}

function toggleFullscreen() {
  const pa = $("playerArea");
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (pa.classList.contains("hidden")) return;
    if (pa.requestFullscreen) {
      pa.requestFullscreen();
    } else if (pa.webkitRequestFullscreen) {
      pa.webkitRequestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
  updateFsIcon();
}

function updateFsIcon() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  $("fsBtn").innerHTML = isFs ? "&#x26F6;" : "&#x26F6;";
}

document.addEventListener("fullscreenchange", () => {
  const isFs = !!document.fullscreenElement;
  $("chatFsBtn").classList.toggle("hidden", !isFs);
  if (!isFs) {
    $("fsChatPanel").classList.remove("show");
    clearTimeout(_fsControlsTimer);
    $("controls").classList.remove("show");
    document.removeEventListener("mousemove", resetFsControlsTimer);
    document.removeEventListener("touchstart", resetFsControlsTimer);
  } else {
    document.addEventListener("mousemove", resetFsControlsTimer);
    document.addEventListener("touchstart", resetFsControlsTimer);
    resetFsControlsTimer();
  }
  _inFullscreenTransition = true;
  updateFsIcon();
  setTimeout(() => {
    _inFullscreenTransition = false;
  }, 300);
});
document.addEventListener("webkitfullscreenchange", () => {
  const isFs = !!document.webkitFullscreenElement;
  $("chatFsBtn").classList.toggle("hidden", !isFs);
  if (!isFs) {
    $("fsChatPanel").classList.remove("show");
    clearTimeout(_fsControlsTimer);
    $("controls").classList.remove("show");
    document.removeEventListener("mousemove", resetFsControlsTimer);
    document.removeEventListener("touchstart", resetFsControlsTimer);
  } else {
    document.addEventListener("mousemove", resetFsControlsTimer);
    document.addEventListener("touchstart", resetFsControlsTimer);
    resetFsControlsTimer();
  }
  _inFullscreenTransition = true;
  updateFsIcon();
  setTimeout(() => {
    _inFullscreenTransition = false;
  }, 300);
});

// ==================== VIDEO PLAYER ====================
function seekRelative(delta) {
  var d = getDuration();
  var t;
  if (playerType === "youtube" && ytPlayer && ytPlayer.getCurrentTime && ytPlayer.seekTo) {
    t = ytPlayer.getCurrentTime() + delta;
    t = Math.max(0, Math.min(t, d || 0));
    ytPlayer.seekTo(t, true);
  } else {
    t = video.currentTime + delta;
    t = Math.max(0, Math.min(t, d || Infinity));
    video.currentTime = t;
  }
  if (isHost && !ignoreNext) {
    localSeek = true;
    _seekEmitLast = Date.now();
    socket.emit("seek", t);
    setTimeout(function() {
      localSeek = false;
    }, 300);
  }
}

function togglePlay() {
  _systemPause = false;
  if (playerType === "youtube" && ytPlayer) {
    var ps = ytPlayer.getPlayerState();
    if (ps === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
    return;
  }
  if (isHost && video.paused && _userWantsPlay && !video.ended) {
    var now = Date.now();
    if (now - _pauseEmitLast < 300) return;
    _pauseEmitLast = now;
    socket.emit("pause", _compensateViewerTime(video.currentTime, null, true));
    _userWantsPlay = false;
    return;
  }
  if (video.paused || video.ended) {
    if (video.ended) video.currentTime = 0;
    _userPause = false;
    _userWantsPlay = true;
    if (isHost) {
      var now = Date.now();
      if (now - _playEmitLast < 300) return;
      _playEmitLast = now;
      _pendingHostPlay = true;
      socket.emit("play", _compensateViewerTime(video.currentTime, null, false));
    }
    video.play().catch(function() {});
  } else {
    _userPause = true;
    _userWantsPlay = false;
    if (isHost) {
      var now = Date.now();
      if (now - _pauseEmitLast < 300) return;
      _pauseEmitLast = now;
      socket.emit("pause", _compensateViewerTime(video.currentTime, null, true));
    }
    video.pause();
  }
}

function toggleMute(e) {
  if (e) e.stopPropagation();
  video.muted = !video.muted;
  var vol = video.muted ? 0 : video.volume;
  document.getElementById('volumeSlider').value = vol;
  document.getElementById('muteBtn').innerHTML = vol === 0 || video.muted ? '&#x1f507;' : vol < 0.5 ? '&#x1f509;' : '&#x1f50a;';
}

function setVolume(val) {
  video.muted = false;
  video.volume = parseFloat(val);
  document.getElementById('muteBtn').innerHTML = val === '0' ? '&#x1f507;' : parseFloat(val) < 0.5 ? '&#x1f509;' : '&#x1f50a;';
}

video.addEventListener("volumechange", function() {
  var el = document.getElementById('volumeSlider');
  var muteBtn = document.getElementById('muteBtn');
  if (!el || !muteBtn) return;
  el.value = video.muted ? 0 : video.volume;
  muteBtn.innerHTML = video.muted || video.volume === 0 ? '&#x1f507;' : video.volume < 0.5 ? '&#x1f509;' : '&#x1f50a;';
});

function onSeekPreview() {
  if (!isHost) return;
  var t = (seekbar.value / 1000) * getDuration();
  timeDisplay.textContent = fmtTime(t) + " / " + fmtTime(getDuration());
}

function onSeek() {
  if (!isHost || ignoreNext) return;
  localSeek = true;
  _seekEmitLast = Date.now();
  var wasPlaying = !video.paused && !video.ended;
  const t = (seekbar.value / 1000) * getDuration();
  if (playerType === "youtube" && ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(t, true);
  } else if (playerType === "proxy") {
    const buffered = video.buffered;
    let inBuffer = false;
    for (let i = 0; i < buffered.length; i++) {
      if (t >= buffered.start(i) && t <= buffered.end(i)) {
        inBuffer = true; break;
      }
    }
    if (!inBuffer && videoMeta && videoMeta.contentLength && video.duration > 0) {
      const byteOffset = Math.floor((t / video.duration) * videoMeta.contentLength);
      socket.emit("proxy-seek", { url: videoMeta.url, byteOffset });
      _pendingProxySeek = t;
      $("waitOverlay").classList.remove("hidden");
      $("waitMsg").textContent = "Seeking...";
      socket.emit("seek", t);
      setTimeout(() => (localSeek = false), 300);
      return;
    }
    video.currentTime = t;
    if (wasPlaying) video.play().catch(function() {});
  } else {
    video.currentTime = t;
    if (wasPlaying) video.play().catch(function() {});
  }
  socket.emit("seek", t);
  setTimeout(() => (localSeek = false), 300);
}


(function() {
  var _origPause = video.pause;
  video.pause = function() {
    _pauseCalledExplicitly = true;
    return _origPause.apply(this, arguments);
  };
})();

video.addEventListener("play", () => {
  _pendingHostPlay = false;
  playBtn.innerHTML = "\u25B6\uFE0E";
  if (_autoResume) {
    _autoResume = false; return;
  }
  if (isHost && !localSeek && !ignoreNext && !_inFullscreenTransition && playerType !== "youtube" && !bufMgr.isRebuffering) {
    var now = Date.now();
    if (now - _playEmitLast < 300) return;
    _playEmitLast = now;
    socket.emit("play", _compensateViewerTime(video.currentTime, null, false));
  }
});

video.addEventListener("pause", () => {
  playBtn.innerHTML = "\u25B6";
  if (_systemPause) {
    _systemPause = false; _userWantsPlay = true; return;
  }
  if (video.ended && isHost) {
    _videoEndedAt = Date.now();
  }
  if (_bufferPause) {
    _bufferPause = false;
    _pauseCalledExplicitly = false;
    return;
  }
  if (_pauseCalledExplicitly) {
    _pauseCalledExplicitly = false;
    _userWantsPlay = false;
    if (_userPause) {
      _userPause = false;
    }
  } else if (isHost && !ignoreNext && !video.ended && playerType !== "youtube" && !bufMgr.isRebuffering) {
    _autoResume = true;
    video.play().catch(function() {});
    return;
  }
  if (isHost && !ignoreNext && !video.ended && playerType !== "youtube" && !bufMgr.isRebuffering) {
    var now = Date.now();
    if (now - _pauseEmitLast < 300) return;
    _pauseEmitLast = now;
    socket.emit("pause", _compensateViewerTime(video.currentTime, null, true));
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isHost && !video.paused) _systemPause = true;
});

video.addEventListener("seeked", () => {
  if (isHost && !localSeek && !ignoreNext && !_inFullscreenTransition && playerType !== "youtube") {
    var now = Date.now();
    if (now - _seekEmitLast < 500) return;
    _seekEmitLast = now;
    socket.emit("seek", video.currentTime);
  }
});

video.addEventListener("timeupdate", () => {
  if (!video.duration || playerType === "youtube") return;
  if (!localSeek) seekbar.value = (video.currentTime / video.duration) * 1000;
  timeDisplay.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
});

video.addEventListener("loadedmetadata", () => {
  seekbar.max = 1000;
  if (pendingState && playerType && playerType !== "youtube") {
    if (Math.abs(video.currentTime - pendingState.t) > 3) {
      video.currentTime = pendingState.t;
    }
    if (pendingState.p && video.paused) {
      video.play().catch(() => {});
    } else if (!pendingState.p && !video.paused && Date.now() - _lastSrcSetAt > 3000) {
      video.pause();
    }
    pendingState = null;
  }
});

video.addEventListener("canplay", () => {
  if ((playerType === "localstream" || playerType === "direct") && (bufMgr.isStartupBuffering || bufMgr.isRebuffering)) return;
  if (!$("waitOverlay").classList.contains("hidden")) {
    $("waitOverlay").classList.add("hidden");
    liveBadge.classList.remove("hidden");
  }
});

video.addEventListener("error", () => {
  if (playerType === "localstream" || playerType === "direct") {
    toast("Video failed to load. Try changing the source.");
    $("waitOverlay").classList.add("hidden");
    liveBadge.classList.add("hidden");
  }
});

// Legacy iframe message handler (no longer used since Direct uses native video)
window.addEventListener("message", () => {});

// Fallback: hide overlay after 10s even if video never reports ready
let overlayTimer = null;
function scheduleOverlayTimeout() {
  if (overlayTimer) clearInterval(overlayTimer);
  overlayTimer = setInterval(() => {
    if (!$("waitOverlay").classList.contains("hidden")) {
      $("waitOverlay").classList.add("hidden");
      liveBadge.classList.remove("hidden");
    }
    clearInterval(overlayTimer);
    overlayTimer = null;
  }, 10000);
}
scheduleOverlayTimeout();

function fmtTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ==================== SOURCE SELECTOR ====================
function selectSource(type) {
  document.querySelectorAll(".source-btn").forEach(b => b.classList.toggle("active", b.dataset.source === type));
  $("uploadSection").classList.toggle("hidden", type !== "upload");
  $("youtubeSection").classList.toggle("hidden", type !== "youtube");
  $("driveSection").classList.toggle("hidden", type !== "drive");
  $("directSection").classList.toggle("hidden", type !== "direct");
  $("localStreamSection").classList.toggle("hidden", type !== "localstream");
  $("iptvSection").classList.toggle("hidden", type !== "iptv");
}

function extractYouTubeId(val) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = val.trim().match(p);
    if (m) return m[1];
  }
  return null;
}

function extractDriveId(val) {
  const m = val.trim().match(/\/file\/d\/([a-zA-Z0-9_-]+)\//);
  return m ? m[1] : null;
}

function initYouTube(videoId) {
  socket.emit("meta", { source: "youtube", videoId });
  ytJustLoaded = true;
  playerType = "youtube";
  $("uploadArea").classList.add("hidden");
  $("playerArea").classList.remove("hidden");
  $("waitOverlay").classList.add("hidden");
  liveBadge.classList.remove("hidden");
  if (ytApiReady) {
    createYTPlayer(videoId);
  } else {
    loadYouTubeAPI();
    ytLoadTimer = setInterval(() => {
      if (ytApiReady) {
        clearInterval(ytLoadTimer); ytLoadTimer = null; createYTPlayer(videoId);
      }
    }, 200);
  }
  $("changeBtn").classList.remove("hidden");
}

function loadYouTube() {
  if (!isHost) return;
  const val = $("youtubeInput").value.trim();
  if (!val) return toast("Enter a YouTube URL or video ID");
  const videoId = extractYouTubeId(val);
  if (!videoId) return toast("Invalid YouTube URL");
  initYouTube(videoId);
}

function loadDrive() {
  if (!isHost) return;
  const val = $("driveInput").value.trim();
  if (!val) return toast("Enter a Google Drive share link");
  const fileId = extractDriveId(val);
  if (!fileId) return toast("Invalid Google Drive link");
  const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  playerType = "drive";
  video.src = directUrl;
  video.load();
  $("playerArea").classList.remove("hidden");
  $("waitOverlay").classList.remove("hidden");
  $("waitMsg").textContent = "Loading video...";
  $("uploadArea").classList.add("hidden");
  liveBadge.classList.add("hidden");
  socket.emit("meta", { source: "drive", fileId, directUrl });
  $("changeBtn").classList.remove("hidden");
}

// ==================== DIRECT URL ====================
function loadDirect() {
  if (!isHost) return;
  const val = $("directInput").value.trim();
  if (!val) return toast("Enter a video URL");
  if (!val.startsWith("http://") && !val.startsWith("https://")) return toast("URL must start with http:// or https://");

  // Detect YouTube URLs and route to YouTube player
  const ytId = extractYouTubeId(val);
  if (ytId) {
    initYouTube(ytId);
    return;
  }

  startDirect(val);
}

let iptvChannels = [];
let iptvSelectedGroup = "";

function loadIPTV() {
  if (!isHost) return;
  const url = $("iptvUrlInput").value.trim();
  if (!url) return toast("Enter an M3U URL");
  if (!url.startsWith("http://") && !url.startsWith("https://")) return toast("URL must start with http:// or https://");
  $("iptvError").classList.add("hidden");
  $("iptvLoadBtn").disabled = true;
  $("iptvLoadBtn").textContent = "Loading...";
  $("iptvStatus").classList.remove("hidden");
  $("iptvChannelList").classList.add("hidden");
  $("iptvGroups").classList.add("hidden");
  fetch("/api/iptv/m3u?url=" + encodeURIComponent(url)).then(r => r.json()).then(data => {
    $("iptvLoadBtn").disabled = false;
    $("iptvLoadBtn").textContent = "Load Channels";
    $("iptvStatus").classList.add("hidden");
    if (data.error) {
      $("iptvError").textContent = data.error;
      $("iptvError").classList.remove("hidden");
      return;
    }
    iptvChannels = data.channels;
    $("iptvChToggle").classList.remove("hidden");
    $("iptvSearchInput").value = "";
    $("iptvSearchInput").classList.remove("hidden");
    if (!iptvChannels.length) {
      $("iptvError").textContent = "No channels found in this M3U.";
      $("iptvError").classList.remove("hidden");
      return;
    }
    renderIptvGroups();
    renderIptvChannels();
  }).catch(e => {
    $("iptvLoadBtn").disabled = false;
    $("iptvLoadBtn").textContent = "Load Channels";
    $("iptvStatus").classList.add("hidden");
    $("iptvError").textContent = "Failed to fetch: " + e.message;
    $("iptvError").classList.remove("hidden");
  });
}

function renderIptvGroups() {
  const groups = [...new Set(iptvChannels.map(c => c.group))];
  const container = $("iptvGroups");
  container.innerHTML = "";
  container.classList.remove("hidden");
  const allBtn = document.createElement("button");
  allBtn.className = "btn btn-glass" + (iptvSelectedGroup === "" ? " active" : "");
  allBtn.style.cssText = "padding:3px 10px;font-size:11px";
  allBtn.textContent = "All (" + iptvChannels.length + ")";
  allBtn.onclick = () => {
    iptvSelectedGroup = ""; document.querySelectorAll("#iptvGroups .btn").forEach(b => b.classList.remove("active")); allBtn.classList.add("active"); renderIptvChannels();
  };
  container.appendChild(allBtn);
  groups.forEach(g => {
    const count = iptvChannels.filter(c => c.group === g).length;
    const btn = document.createElement("button");
    btn.className = "btn btn-glass";
    btn.style.cssText = "padding:3px 10px;font-size:11px";
    btn.textContent = g + " (" + count + ")";
    btn.onclick = () => {
      iptvSelectedGroup = g; document.querySelectorAll("#iptvGroups .btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); renderIptvChannels();
    };
    container.appendChild(btn);
  });
}

function renderIptvChannels() {
  const container = $("iptvChannelList");
  container.innerHTML = "";
  container.classList.remove("hidden");
  const query = ($("iptvSearchInput").value || "").toLowerCase().trim();
  let filtered = iptvSelectedGroup ? iptvChannels.filter(c => c.group === iptvSelectedGroup) : iptvChannels;
  if (query) filtered = filtered.filter(c => c.name.toLowerCase().includes(query));
  if (!filtered.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:oklch(0.7 0.04 256.788 / 0.5);font-size:13px"></div>';
    container.firstChild.textContent = query ? 'No channels match "' + $("iptvSearchInput").value + '".' : "No channels in this group.";
    return;
  }
  filtered.forEach((ch, i) => {
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid oklch(1 0 0 / 0.04);transition:background .15s";
    item.onmouseenter = () => item.style.background = "oklch(1 0 0 / 0.04)";
    item.onmouseleave = () => item.style.background = "";
    item.onclick = () => selectIptvChannel(ch);
    if (ch.logo) {
      const img = document.createElement("img");
      img.src = ch.logo;
      img.style.cssText = "width:32px;height:32px;object-fit:contain;border-radius:4px;flex-shrink:0";
      img.onerror = () => img.remove();
      item.appendChild(img);
    }
    const name = document.createElement("span");
    name.style.cssText = "font-size:13px;color:oklch(0.85 0.02 260);flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    name.textContent = ch.name;
    item.appendChild(name);
    container.appendChild(item);
  });
}

function selectIptvChannel(ch) {
  if (!isHost) return;
  socket.emit("iptv-channel", { url: ch.url, name: ch.name, logo: ch.logo });
  startDirect(ch.url);
  $("iptvSection").classList.add("hidden");
  document.querySelectorAll(".source-btn").forEach(b => b.classList.remove("active"));
  toast("Playing: " + ch.name);
  hideIptvChOverlay();
}

function toggleIptvChOverlay() {
  if ($("iptvChOverlay").classList.contains("hidden")) showIptvChOverlay();
  else hideIptvChOverlay();
}
function showIptvChOverlay() {
  if (!iptvChannels.length) return;
  renderIptvChOverlayGroups();
  renderIptvChOverlay();
  $("iptvChOverlay").classList.remove("hidden");
  $("iptvChSearchInput").value = "";
  $("iptvChSearchInput").focus();
}
function hideIptvChOverlay() {
  $("iptvChOverlay").classList.add("hidden");
}
function renderIptvChOverlayGroups() {
  const groups = [...new Set(iptvChannels.map(c => c.group))];
  const container = $("iptvChGroups");
  container.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.className = "btn btn-glass active";
  allBtn.style.cssText = "padding:3px 10px;font-size:11px";
  allBtn.textContent = "All (" + iptvChannels.length + ")";
  allBtn.onclick = () => {
    iptvSelectedGroup = ""; container.querySelectorAll(".btn").forEach(b => b.classList.remove("active")); allBtn.classList.add("active"); renderIptvChOverlay();
  };
  container.appendChild(allBtn);
  groups.forEach(g => {
    const count = iptvChannels.filter(c => c.group === g).length;
    const btn = document.createElement("button");
    btn.className = "btn btn-glass";
    btn.style.cssText = "padding:3px 10px;font-size:11px";
    btn.textContent = g + " (" + count + ")";
    btn.onclick = () => {
      iptvSelectedGroup = g; container.querySelectorAll(".btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); renderIptvChOverlay();
    };
    container.appendChild(btn);
  });
}
function renderIptvChOverlay() {
  const container = $("iptvChList");
  container.innerHTML = "";
  const query = ($("iptvChSearchInput").value || "").toLowerCase().trim();
  let filtered = iptvSelectedGroup ? iptvChannels.filter(c => c.group === iptvSelectedGroup) : iptvChannels;
  if (query) filtered = filtered.filter(c => c.name.toLowerCase().includes(query));
  if (!filtered.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:oklch(0.7 0.04 256.788 / 0.5);font-size:13px"></div>';
    container.firstChild.textContent = query ? "No channels match." : "No channels in this group.";
    return;
  }
  filtered.forEach(ch => {
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-radius:6px;transition:background .15s";
    item.onmouseenter = () => item.style.background = "oklch(1 0 0 / 0.06)";
    item.onmouseleave = () => item.style.background = "";
    item.onclick = () => selectIptvChannel(ch);
    if (ch.logo) {
      const img = document.createElement("img");
      img.src = ch.logo;
      img.style.cssText = "width:28px;height:28px;object-fit:contain;border-radius:4px;flex-shrink:0";
      img.onerror = () => img.remove();
      item.appendChild(img);
    }
    const name = document.createElement("span");
    name.style.cssText = "font-size:13px;color:oklch(0.85 0.02 260);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    name.textContent = ch.name;
    item.appendChild(name);
    container.appendChild(item);
  });
}

function setupDirectPlayback(proxyUrl, isHls, isDash) {
  $("directIframe").classList.add("hidden");
  $("directIframe").src = "";
  video.classList.remove("hidden");
  $("youtubePlayer").classList.add("hidden");
  $("playerArea").classList.remove("hidden");
  $("uploadArea").classList.add("hidden");
  $("waitOverlay").classList.remove("hidden");
  $("waitMsg").textContent = "Loading video...";
  $("controls").classList.add("show");
  liveBadge.classList.add("hidden");
  playerType = "direct";
  _lastSrcSetAt = Date.now();
  if (isHls && window.Hls && window.Hls.isSupported()) {
    if (window.hlsInstance) {
      window.hlsInstance.destroy();
    }
    var h = new Hls();
    window._diagHlsCount = (window._diagHlsCount || 0) + 1;
    window.hlsInstance = h;
    h.loadSource(proxyUrl);
    h.attachMedia(video);
    h.on(Hls.Events.MANIFEST_PARSED, function() {
      $("waitOverlay").classList.add("hidden");
      liveBadge.classList.remove("hidden");
    });
    video.play().catch(function() {});
  } else if (isDash && window.dashjs && window.dashjs.MediaPlayer) {
    if (dashPlayer) {
      try {
        dashPlayer.reset();
      } catch (e) {}
    }
    dashPlayer = dashjs.MediaPlayer().create();
    window._diagDashCount = (window._diagDashCount || 0) + 1;
    dashPlayer.on('streamInitialized', function() {
      $("waitOverlay").classList.add("hidden");
      liveBadge.classList.remove("hidden");
    });
    dashPlayer.initialize(video, proxyUrl, true);
  } else {
    video.src = proxyUrl;
    video.load();
    waitForStartupBuffer(function () {
      $("waitOverlay").classList.add("hidden");
      liveBadge.classList.remove("hidden");
      startBufferMonitor();
      if (_pendingHostPlay && video.paused) {
        _pendingHostPlay = false; video.play().catch(function() {});
      }
    });
  }
}

function startDirect(url) {
  console.log("[DIAG-" + window._diagTag + "] startDirect url=" + url.substring(0, 80));
  var proxyUrl = "/proxy?url=" + encodeURIComponent(url);
  window._diagProxyUrl = proxyUrl;
  var isHls = url.toLowerCase().endsWith(".m3u8");
  var isDash = url.toLowerCase().endsWith(".mpd");
  setupDirectPlayback(proxyUrl, isHls, isDash);
  $("changeBtn").classList.remove("hidden");
  $("fsBtn").classList.remove("hidden");
  socket.emit("meta", { source: "direct", url, isHls: isHls, isDash: isDash });
  startSyncTimer();
}

// ==================== TORRENT (reclaim only) ====================
function startTorrent(torrentId) {
  if (!window.WebTorrent) return toast("WebTorrent not loaded. Check your internet connection.");
  playerType = "torrent";
  _lastSrcSetAt = Date.now();
  scheduleOverlayTimeout();
  $("playerArea").classList.remove("hidden");
  $("uploadArea").classList.add("hidden");
  $("waitOverlay").classList.remove("hidden");
  $("waitMsg").textContent = "Connecting to torrent peers...";
  video.classList.add("hidden");
  $("youtubePlayer").classList.add("hidden");
  socket.emit("meta", { source: "torrent", torrentId });
  if (!torrentClient) torrentClient = new WebTorrent();
  if (torrentObj) {
    torrentObj.destroy(); torrentObj = null;
  }
  torrentClient.add(torrentId, { announce: [] }, (torrent) => {
    torrentObj = torrent;
    const file = torrent.files.find((f) => f.name.match(/\.(mp4|mkv|webm|mov|avi|m4v)$/i));
    if (!file) {
      toast("No playable video file found in torrent"); return;
    }
    $("waitMsg").textContent = `Downloading "${file.name}"... 0%`;
    file.renderTo(video, { autoplay: true }, () => {
      video.classList.remove("hidden");
      $("waitOverlay").classList.add("hidden");
      liveBadge.classList.remove("hidden");
      $("changeBtn").classList.remove("hidden");
    });
    file.on("progress", () => {
      $("waitMsg").textContent = `Downloading "${file.name}"... ${Math.round(file.progress * 100)}%`;
    });
  });
  torrentClient.on("error", (err) => {
    toast("Torrent error: " + err.message);
  });
}

// ==================== YOUTUBE API ====================
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    ytApiReady = true; return;
  }
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.getElementsByTagName("script")[0].parentNode.insertBefore(tag, document.getElementsByTagName("script")[0]);
}

window.onYouTubeIframeAPIReady = function () {
  ytApiReady = true;
};

function createYTPlayer(videoId) {
  destroyYTPlayer();
  $("youtubePlayer").classList.remove("hidden");
  ytPlayer = new YT.Player("youtubePlayer", {
    videoId,
    height: "100%",
    width: "100%",
    playerVars: {
      autoplay: 0,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      enablejsapi: 1,
      playsinline: 1,
    },
    events: {
      onReady() {
        onYTReady();
      },
      onStateChange(e) {
        onYTStateChange(e);
      },
    },
  });
}

function destroyYTPlayer() {
  if (ytPlayer) {
    try {
      ytPlayer.destroy();
    } catch (e) {} ytPlayer = null;
  }
  if (ytInterval) {
    clearInterval(ytInterval); ytInterval = null;
  }
  if (ytLoadTimer) {
    clearInterval(ytLoadTimer); ytLoadTimer = null;
  }
}

function onYTReady() {
  if (ytInterval) clearInterval(ytInterval);
  ytInterval = setInterval(updateYTTime, 250);
  startSyncTimer();
  if (pendingState) {
    if (pendingState._seq !== undefined && pendingState._seq < _lastAppliedSeq) {
      pendingState = null;
    } else {
      if (pendingState._seq !== undefined) _lastAppliedSeq = pendingState._seq;
      ytPlayer.seekTo(pendingState.t, true);
      if (pendingState.p) ytPlayer.playVideo();
      else ytPlayer.pauseVideo();
      pendingState = null;
    }
  }
  if (isHost && ytJustLoaded) {
    ytJustLoaded = false;
    const t = ytPlayer.getCurrentTime() || 0;
    socket.emit("yt-sync", { t });
  }
}

function onYTStateChange(event) {
  if (!isHost || !ytPlayer || playerType !== "youtube" || ignoreNext || localSeek || _systemPause) return;
  if (event.data === YT.PlayerState.PLAYING) {
    playBtn.innerHTML = "\u23F8";
    socket.emit("play", ytPlayer.getCurrentTime());
  } else if (event.data === YT.PlayerState.PAUSED) {
    playBtn.innerHTML = "\u25B6";
    socket.emit("pause", ytPlayer.getCurrentTime());
  }
}

function updateYTTime() {
  if (playerType !== "youtube" || !ytPlayer || !ytPlayer.getCurrentTime) return;
  const t = ytPlayer.getCurrentTime();
  const d = ytPlayer.getDuration();
  if (!localSeek) seekbar.value = d > 0 ? (t / d) * 1000 : 0;
  if (d > 0) {
    timeDisplay.textContent = fmtTime(t) + " / " + fmtTime(d);
  } else {
    timeDisplay.textContent = fmtTime(t) + " / 0:00";
  }
}

function getDuration() {
  if (playerType === "youtube" && ytPlayer && ytPlayer.getDuration) return ytPlayer.getDuration() || 1;
  return video.duration || 1;
}
