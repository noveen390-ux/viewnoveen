socket.on("connect", () => {
  if (!connected) {
    createBtn.disabled = false;
    createBtn.textContent = "Create Room";
    joinBtn.disabled = false;
    joinBtn.textContent = "Join Room";
  }
  connected = true;

  if (roomCode && !_reconnecting) {
    if (isHost) reclaimHost();
    else rejoinRoom();
  }
  clearInterval(window._rttTimer);
  window._rttTimer = setInterval(function() {
    var t0 = Date.now();
    socket.emit("ping-rtt", t0, function(serverTime) {
      var rtt = Date.now() - t0;
      recordRTT(rtt);
      if (serverTime) {
        var oneWay = Math.min(_minRTT === Infinity ? 50 : _minRTT / 2, (_estRTT || 100) / 2);
        var sample = serverTime + oneWay - Date.now();
        if (Math.abs(sample) > 5) {
          _clockOffsetSamples.push(sample);
          if (_clockOffsetSamples.length > 15) _clockOffsetSamples.shift();
          var sorted = _clockOffsetSamples.slice().sort(function(a, b) {
            return a - b;
          });
          _serverClockOffset = sorted[Math.floor(sorted.length / 2)] || 0;
        }
      }
    });
  }, 10000);
});

let _reconnectTimer = null;

socket.on("disconnect", () => {
  if (_speedSyncActive) {
    clearTimeout(_speedSyncTimeout);
    video.playbackRate = 1.0;
    _speedSyncActive = false;
  }
  clearTimeout(_syncWatchdogTimer);
  _syncWatchdogArmed = false;
  if (roomCode && !intentionalLeave) {
    _reconnectTimer = setTimeout(function () {
      $("reconnectBar").classList.remove("hidden");
    }, 3000);
  }
});

socket.on("reconnect_attempt", () => {});

socket.on("reconnect", () => {
  clearTimeout(_reconnectTimer);
  _reconnectTimer = null;
  $("reconnectBar").classList.add("hidden");
});

// Socket event spy (log all incoming socket events)
(function() {
  var _installed = false;
  function installSpy() {
    if (_installed || !socket.onevent) return;
    _installed = true;
    var _orig = socket.onevent;
    socket.onevent = function(pkt) {
      var args = pkt.data || [];
      if (args.length > 0 && args[0] !== "chat") {
        console.log("[DIAG-SOCKET-" + window._diagTag + "] <-- " + args[0] + " " + JSON.stringify(args.slice(1)).substring(0, 160));
      }
      _orig.call(this, pkt);
    };
  }
  // Try now, and also on every connect
  installSpy();
  socket.on("connect", installSpy);
})();
// ==================== SOCKET EVENTS ====================
socket.on("meta", (m) => {
  videoMeta = m;
  scheduleOverlayTimeout();
  destroyYTPlayer();
  if (ytInterval) {
    clearInterval(ytInterval); ytInterval = null;
  }
  $("youtubePlayer").classList.add("hidden");
  video.classList.remove("hidden");
  $("controls").classList.remove("hidden");
  $("controls").classList.add("viewer");

  // YouTube source
  if (m.source === "youtube") {
    playerType = "youtube";
    $("playerArea").classList.remove("hidden");
    $("uploadArea").classList.add("hidden");
    $("waitOverlay").classList.add("hidden");
    liveBadge.classList.remove("hidden");

    if (ytApiReady) {
      createYTPlayer(m.videoId);
    } else {
      loadYouTubeAPI();
      ytLoadTimer = setInterval(() => {
        if (ytApiReady) {
          clearInterval(ytLoadTimer); ytLoadTimer = null; createYTPlayer(m.videoId);
        }
      }, 200);
    }
    return;
  }

  // Google Drive source
  if (m.source === "drive") {
    playerType = "drive";
    _lastSrcSetAt = Date.now();
    $("playerArea").classList.remove("hidden");
    $("waitOverlay").classList.remove("hidden");
    $("waitMsg").textContent = "Loading video...";
    liveBadge.classList.add("hidden");
    video.src = m.directUrl;
    video.load();
    waitForStartupBuffer(function () {
      $("waitOverlay").classList.add("hidden");
      liveBadge.classList.remove("hidden");
    });
    return;
  }

  // Direct URL source
  if (m.source === "direct") {
    if (!m.url || m.url.trim() === '' || m.url === 'undefined') {
      console.warn("meta direct: empty/undefined url, ignoring"); return;
    }
    directPlaying = false;
    var proxyUrl = "/proxy?url=" + encodeURIComponent(m.url);
    var isHls = m.isHls || m.url.toLowerCase().endsWith(".m3u8");
    var isDash = m.isDash || m.url.toLowerCase().endsWith(".mpd");
    setupDirectPlayback(proxyUrl, isHls, isDash);
    return;
  }

  // Torrent source
  if (m.source === "torrent") {
    startTorrent(m.torrentId);
    return;
  }

  // Proxy source (chunked via Socket.IO by server)
  if (m.source === "proxy") {
    playerType = "proxy";
    _lastSrcSetAt = Date.now();
    proxyMode = true;
    proxyBuffer = null;
    ms = null; sb = null; chunkQ = []; appending = false;
    $("playerArea").classList.remove("hidden");
    $("uploadArea").classList.add("hidden");
    $("waitOverlay").classList.remove("hidden");
    $("waitMsg").textContent = "Loading video...";
    liveBadge.classList.add("hidden");
    video.classList.remove("hidden");
    $("youtubePlayer").classList.add("hidden");

    const mime = m.type || "video/mp4";
    if (window.MediaSource && MediaSource.isTypeSupported(mime)) {
      setupMediaSource(mime);
    } else {
      proxyBuffer = [];
      useFallback = true;
    }
    return;
  }

  // Local Stream source
  if (m.source === "localstream") {
    playerType = "localstream";
    pendingState = null;
    _lastSrcSetAt = Date.now();
    $("playerArea").classList.remove("hidden");
    $("uploadArea").classList.add("hidden");
    $("waitOverlay").classList.remove("hidden");
    $("waitMsg").textContent = "Buffering...";
    liveBadge.classList.add("hidden");
    video.classList.remove("hidden");
    video.src = m.url;
    video.load();
    waitForStartupBuffer(function () {
      $("waitOverlay").classList.add("hidden");
      liveBadge.classList.remove("hidden");
      startBufferMonitor();
    });
    return;
  }

  // Upload source - existing behavior
  proxyMode = false;
  proxyBuffer = null;
  playerType = "upload";
  totalChunks = m.t;
  chunkBuf = new Array(m.t);
  useFallback = false;
  ms = null;
  sb = null;
  chunkQ = [];
  appending = false;
  receiving = false;

  $("playerArea").classList.remove("hidden");
  $("waitOverlay").classList.remove("hidden");
  $("waitMsg").textContent = "Loading video... 0%";
  liveBadge.classList.add("hidden");

  const mime = m.type || "video/mp4";
  if (window.MediaSource && MediaSource.isTypeSupported(mime)) {
    setupMediaSource(mime);
  } else {
    useFallback = true;
  }
});

socket.on("chunk", (d) => {
  if (playerType !== "upload" && playerType !== "proxy") return;
  const buf = new Uint8Array(d.d);
  chunkBuf[d.i] = buf;
  if (!receiving) {
    receiving = true;
    $("waitOverlay").classList.remove("hidden");
    $("waitMsg").textContent = "Loading video...";
  }

  if (useFallback) {
    const received = chunkBuf.filter(Boolean).length;
    $("waitMsg").textContent = `Loading video... ${Math.round((received / totalChunks) * 100)}%`;
    if (received === totalChunks) {
      finalizeBlob();
    }
    return;
  }

  chunkQ.push(buf);
  processQ();
});

socket.on("proxy-chunk", (data) => {
  if (playerType !== "proxy") return;
  const buf = new Uint8Array(data.d);
  if (useFallback && proxyBuffer) {
    proxyBuffer.push(buf);
  } else if (proxyMode) {
    chunkQ.push(buf);
    processQ();
  }
});

socket.on("proxy-end", () => {
  if (playerType !== "proxy") return;
  if (useFallback && proxyBuffer && proxyBuffer.length > 0) {
    if (_blobUrl) {
      URL.revokeObjectURL(_blobUrl); _blobUrl = null;
    }
    const blob = new Blob(proxyBuffer, { type: videoMeta ? videoMeta.type || "video/mp4" : "video/mp4" });
    var url = URL.createObjectURL(blob);
    _blobUrl = url;
    video.src = url;
    $("waitOverlay").classList.add("hidden");
    liveBadge.classList.remove("hidden");
    proxyBuffer = null;
  } else if (proxyMode && ms && ms.readyState === "open") {
    try {
      ms.endOfStream();
    } catch (e) {}
    $("waitOverlay").classList.add("hidden");
    liveBadge.classList.remove("hidden");
  }
  proxyMode = false;
});

socket.on("proxy-meta", (meta) => {
  if (playerType !== "proxy") return;
  if (meta.contentType && videoMeta && videoMeta.source === "proxy") {
    videoMeta.type = meta.contentType;
  }
});

socket.on("proxy-flush", () => {
  if (playerType !== "proxy") return;
  if (ms && ms.readyState === "open" && sb) {
    try {
      sb.abort();
      if (ms.sourceBuffers.length > 0) {
        while (ms.sourceBuffers.length > 0) {
          ms.removeSourceBuffer(ms.sourceBuffers[0]);
        }
      }
    } catch (e) {}
  }
  ms = null; sb = null; chunkQ = []; appending = false;
  proxyBuffer = [];
  // Re-setup MediaSource with the same mime type
  if (videoMeta && videoMeta.type && window.MediaSource && MediaSource.isTypeSupported(videoMeta.type)) {
    setupMediaSource(videoMeta.type);
  }
  $("waitOverlay").classList.remove("hidden");
  $("waitMsg").textContent = "Seeking...";
});

socket.on("proxy-error", (msg) => {
  if (playerType !== "proxy") return;
  toast("Proxy stream error: " + msg);
  proxyMode = false;
  proxyBuffer = null;
  $("waitOverlay").classList.add("hidden");
});

socket.on("play", ({ t, savedAt, _seq }) => {
  if (!playerType) { pendingState = { t, p: true, _seq }; return; }
  if (bufMgr.isRebuffering) return;
  if (isHost && !_inFullscreenTransition) return;
  if (_seq !== undefined) {
    if (_seq < _lastAppliedSeq) return;
    _lastAppliedSeq = Math.max(_lastAppliedSeq, _seq);
  }
  ignoreNext = false;
  updateClockOffset(savedAt);
  const _compT = _compensateViewerTime(t, savedAt, false);
  if (playerType === "youtube" && ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(_compT, true);
    ytPlayer.playVideo();
  } else {
    video.currentTime = _compT;
    video.play().catch(() => {});
  }
});

socket.on("pause", ({ t, savedAt, _seq }) => {
  if (!playerType) {
    updateClockOffset(savedAt);
    pendingState = { t: _compensateViewerTime(t, savedAt, true), p: false, _seq };
    return;
  }
  if (bufMgr.isRebuffering || (isHost && !_inFullscreenTransition)) return;
  if (_seq !== undefined) {
    if (_seq < _lastAppliedSeq) return;
    _lastAppliedSeq = Math.max(_lastAppliedSeq, _seq);
  }
  if (_speedSyncActive) {
    clearTimeout(_speedSyncTimeout);
    video.playbackRate = 1.0;
    _speedSyncActive = false;
  }
  ignoreNext = false;
  updateClockOffset(savedAt);
  const _compPause = _compensateViewerTime(t, savedAt, true);
  if (playerType === "youtube" && ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(_compPause, true);
    ytPlayer.pauseVideo();
  } else {
    video.currentTime = _compPause;
    if (Date.now() - _lastSrcSetAt > 3000) video.pause();
  }
});

socket.on("seek", ({ t, savedAt, _seq }) => {
  if (!playerType) {
    updateClockOffset(savedAt);
    pendingState = { t: _compensateViewerTime(t, savedAt, true), p: false, _seq };
    return;
  }
  if (isHost && !_inFullscreenTransition) return;
  if (_seq !== undefined) {
    if (_seq < _lastAppliedSeq) return;
    _lastAppliedSeq = Math.max(_lastAppliedSeq, _seq);
  }
  if (_speedSyncActive) {
    clearTimeout(_speedSyncTimeout);
    video.playbackRate = 1.0;
    _speedSyncActive = false;
  }
  ignoreNext = false;
  updateClockOffset(savedAt);
  const _compSeek = _compensateViewerTime(t, savedAt, true);
  if (playerType === "youtube" && ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(_compSeek, true);
  } else {
    var wasPlaying = !video.paused && !video.ended;
    video.currentTime = _compSeek;
    if (wasPlaying) video.play().catch(function() {});
  }
});

socket.on("sync-state", ({ t, p, _seq, savedAt }) => {
  console.log("VIEWER EVENT: sync-state", {t, p, _seq, savedAt, videoCT: video.currentTime, videoPaused: video.paused, videoEnded: video.ended});
  if (isHost) return;
  if (!playerType) {
    updateClockOffset(savedAt);
    pendingState = { t: _compensateViewerTime(t, savedAt, !p), p, _seq };
    return;
  }
  if (bufMgr.isRebuffering) return;
  if (_seq !== undefined) {
    if (_seq < _lastAppliedSeq) return;
    _lastAppliedSeq = Math.max(_lastAppliedSeq, _seq);
  }
  _syncWatchdogArmed = true;
  clearTimeout(_syncWatchdogTimer);
  _syncWatchdogTimer = setTimeout(function requestSync() {
    if (isHost || !roomCode) return;
    socket.emit("sync-request");
    if (_syncWatchdogArmed) _syncWatchdogTimer = setTimeout(requestSync, 10000);
  }, 5000);
  updateClockOffset(savedAt);
  const compensatedT = _compensateViewerTime(t, savedAt, !p);
  if (playerType === "youtube") {
    if (ytPlayer && ytPlayer.getCurrentTime) {
      const ct = ytPlayer.getCurrentTime();
      var ytDriftThreshold = Math.max(1.5, 1 + _estRTT / 500);
      if (Math.abs(ct - compensatedT) > ytDriftThreshold) {
        ytPlayer.seekTo(compensatedT, true);
      }
      if (p && ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) ytPlayer.playVideo();
      else if (!p && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
    } else {
      pendingState = { t: compensatedT, p, _seq };
    }
    return;
  }
  var diff = Math.abs(video.currentTime - compensatedT);
  var driftThreshold = Math.max(1.5, 1.0 + _estRTT / 500);
  var speedSyncFloor = 0.8;
  if (diff > driftThreshold && video.duration && !video.seeking && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    if (_speedSyncActive) {
      clearTimeout(_speedSyncTimeout);
      video.playbackRate = 1.0;
      _speedSyncActive = false;
    }
    if (Math.abs(compensatedT - _lastSyncTargetT) < 0.5) {
    } else {
      _lastSyncTargetT = compensatedT;
      _lastSyncTime = Date.now();
      video.currentTime = compensatedT;
    }
  } else if (diff > speedSyncFloor && diff <= driftThreshold && video.duration && !video.seeking) {
    var signedDrift = video.currentTime - compensatedT;
    applySpeedToSync(-signedDrift);
  } else if (_speedSyncActive && diff <= speedSyncFloor) {
    clearTimeout(_speedSyncTimeout);
    video.playbackRate = 1.0;
    _speedSyncActive = false;
  }
  if (p && (video.paused || video.ended)) {
    if (video.ended) video.currentTime = 0;
    video.play().catch(function() {});
  } else if (!p && !video.paused) {
    video.pause();
  }
});

// ==================== SUBTITLE SOCKET EVENTS ====================
socket.on("subtitle-ready", function() {
  if (isHost) return;
  loadSubtitle();
});

socket.on("subtitle-check-response", function(data) {
  if (data.hasSubtitle) loadSubtitle();
});

// ==================== END SUBTITLE SOCKET EVENTS ====================

// Subtitle search events (host only)
socket.on("search-results", function(data) {
  if (data.error) {
    showSubSearchStatus(data.error, true);
    return;
  }
  showSubSearchResults(data.results || []);
});

socket.on("subtitle-downloaded", function(data) {
  if (data.error) {
    showSubSearchStatus(data.error, true);
    return;
  }
  applyDownloadedSubtitle(data.vtt);
});

socket.on("state", (s) => {
  if (bufMgr.isRebuffering) return;
  if (!s) return;
  if (!s.p && s.t === undefined) return;
  if (s._seq !== undefined && s._seq <= _lastAppliedSeq) return;
  if (s._seq !== undefined) _lastAppliedSeq = Math.max(_lastAppliedSeq, s._seq);
  updateClockOffset(s.savedAt);
  var effectiveT = _compensateViewerTime(s.t, s.savedAt, !s.p);
  if (playerType === "youtube") {
    if (ytPlayer && ytPlayer.seekTo && ytPlayer.getCurrentTime) {
      if (Math.abs(ytPlayer.getCurrentTime() - effectiveT) > 3) {
        ytPlayer.seekTo(effectiveT, true);
      }
      if (s.p) ytPlayer.playVideo();
      else ytPlayer.pauseVideo();
    } else {
      pendingState = { t: effectiveT, p: s.p, _seq: s._seq };
    }
  } else {
    console.log("[DIAG-" + window._diagTag + "-STATE] p=" + s.p + " t=" + effectiveT + " ct=" + video.currentTime.toFixed(2) + " d=" + video.duration + " rs=" + video.readyState + " ps=" + video.paused + " sk=" + video.seeking + " playerType=" + playerType + " pendingState=" + (pendingState ? "yes" : "no"));
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      if (Math.abs(video.currentTime - effectiveT) > 3) {
        video.currentTime = effectiveT;
      }
      if (s.p && (video.paused || video.ended)) {
        if (video.ended) video.currentTime = 0;
        video.play().catch(() => {});
      } else if (!s.p && !video.paused && Date.now() - _lastSrcSetAt > 3000) {
        video.pause();
      }
      pendingState = null;
    } else {
      pendingState = { t: effectiveT, p: s.p, _seq: s._seq };
    }
  }
});

socket.on("count", (n) => {
  $("viewerCount").textContent = n;
});

socket.on("chat", ({ n, m, id }) => {
  _pendingChatMsgs = _pendingChatMsgs || [];
  _pendingChatMsgs.push({ n, m });
  if (!_chatScheduled) {
    _chatScheduled = true;
    setTimeout(flushChatMessages, 0);
  }
});

socket.on("reset", () => {
  removeSubtitle();
  bufMgr.isStartupBuffering = false;
  bufMgr.isRebuffering = false;
  bufMgr.consecutiveStalls = 0;
  clearTimeout(bufMgr._stallTimer);
  destroyYTPlayer();
  if (ytInterval) {
    clearInterval(ytInterval); ytInterval = null;
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
  if (dashPlayer) {
    try {
      dashPlayer.reset();
    } catch (e) {} dashPlayer = null;
  }
  if (torrentClient && torrentObj) {
    torrentObj.destroy(); torrentObj = null;
  }
  if (window.hlsInstance) {
    window.hlsInstance.destroy(); window.hlsInstance = null;
  }
  pendingState = null;
  ytJustLoaded = false;
  localSeek = false;
  playerType = null;
  directPlaying = false;
  $("controls").classList.remove("show", "viewer");
  $("controls").classList.add("hidden");
  $("playerArea").classList.add("hidden");
  $("youtubePlayer").classList.add("hidden");
  $("directIframe").classList.add("hidden");
  $("directIframe").src = "";
  video.classList.remove("hidden");
  $("playBtn").classList.remove("hidden");
  $("seekbar").classList.remove("hidden");
  $("timeDisplay").classList.remove("hidden");
  $("waitOverlay").classList.remove("hidden");
  $("waitMsg").textContent = "Host is selecting a new video...";
  liveBadge.classList.add("hidden");
  $("changeBtn").classList.add("hidden");
});

socket.on("yt-sync", ({ t, savedAt, _seq }) => {
  if (!playerType) return;
  if (_seq !== undefined) {
    if (_seq < _lastAppliedSeq) return;
    _lastAppliedSeq = Math.max(_lastAppliedSeq, _seq);
  }
  updateClockOffset(savedAt);
  var _compT = _compensateViewerTime(t, savedAt, false);
  pendingState = { t: _compT, p: true };
  $("waitOverlay").classList.add("hidden");
  if (playerType === "youtube" && ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(_compT, true);
    ytPlayer.playVideo();
    pendingState = null;
  }
});

socket.on("end", () => {
  toast("Host left. Attempting to reconnect...");
  var _endTimer = setTimeout(() => {
    roomCode = null;
    isHost = false;
    transitionPage($("room"), $("landing"));
  }, 5000);
  function _onRecovered() {
    clearTimeout(_endTimer);
    toast("Host reconnected.", 1500);
    socket.off("host-recovered", _onRecovered);
  }
  socket.on("host-recovered", _onRecovered);
});

socket.on("iptv-channel", ({ url, name, logo }) => {
  if (isHost) return;
});

// ==================== MEDIASOURCE ====================
function setupMediaSource(mime) {
  if (_blobUrl) {
    URL.revokeObjectURL(_blobUrl); _blobUrl = null;
  }
  ms = new MediaSource();
  var url = URL.createObjectURL(ms);
  _blobUrl = url;
  video.src = url;

  ms.addEventListener("sourceopen", () => {
    try {
      sb = ms.addSourceBuffer(mime);
    } catch (e) {
      useFallback = true;
      URL.revokeObjectURL(video.src);
      video.src = "";
      chunkQ = [];
      // If chunks already received, switch to blob
      if (chunkBuf.filter(Boolean).length > 0) {
        finalizeBlob();
      }
      return;
    }

    sb.addEventListener("updateend", () => {
      appending = false;
      processQ();
    });

    // Process any queued chunks
    processQ();
    if (_pendingProxySeek !== null) {
      var _seekT = _pendingProxySeek;
      _pendingProxySeek = null;
      video.currentTime = _seekT;
    }
  });

  ms.addEventListener("sourceended", () => {
    $("waitOverlay").classList.add("hidden");
    liveBadge.classList.remove("hidden");
  });
}

function processQ() {
  if (appending || !sb || chunkQ.length === 0) return;
  appending = true;
  const chunk = chunkQ.shift();
  try {
    sb.appendBuffer(chunk);
  } catch (e) {
    appending = false;
    processQ();
    return;
  }

  // Update loading progress
  const received = chunkBuf.filter(Boolean).length;
  if (!proxyMode && received > 0 && received < totalChunks && !$("waitOverlay").classList.contains("hidden")) {
    $("waitMsg").textContent = `Loading video... ${Math.round((received / totalChunks) * 100)}%`;
  }

  // Check if we have all chunks
  if (!proxyMode && received === totalChunks && ms && ms.readyState === "open") {
    try {
      ms.endOfStream();
    } catch (e) {}
    $("waitOverlay").classList.add("hidden");
    liveBadge.classList.remove("hidden");
  }
}

function finalizeBlob() {
  const blobs = [];
  for (let i = 0; i < totalChunks; i++) {
    if (chunkBuf[i]) {
      blobs.push(chunkBuf[i]);
    }
  }
  if (blobs.length === 0) return;
  if (_blobUrl) {
    URL.revokeObjectURL(_blobUrl); _blobUrl = null;
  }
  const blob = new Blob(blobs, { type: videoMeta.type || "video/mp4" });
  const url = URL.createObjectURL(blob);
  _blobUrl = url;
  video.src = url;
  $("playerArea").classList.remove("hidden");
  $("waitOverlay").classList.add("hidden");
  liveBadge.classList.remove("hidden");
  $("uploadArea").classList.add("hidden");
}
