// ==================== STATE ====================
const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 3000,
});
window.__socket = socket;
let connected = false;
let roomCode = null;
let isHost = false;
let myName = "Anonymous";
let videoMeta = null;
let totalChunks = 0;
let chunkBuf = [];
let useFallback = false;
let ms = null;
let sb = null;
let chunkQ = [];
let appending = false;
let proxyMode = false;
let proxyBuffer = null;
let localSeek = false;
let ignoreNext = false;
let receiving = false;
let syncTimer = null;
let playerType = null;
let ytPlayer = null;
let ytApiReady = false;
let ytInterval = null;
let torrentClient = null;
let torrentObj = null;
let dashPlayer = null;
let pendingState = null;
let ytJustLoaded = false;
let ytLoadTimer = null;
let intentionalLeave = false;
let _lastSrcSetAt = 0;
let _blobUrl = null;
let directPlaying = false;
let directTime = 0;
let _inFullscreenTransition = false;
let _fsControlsTimer = null;
let _lastSyncTargetT = -1;
let _lastSyncTime = 0;
let subtitleCues = [];
let subtitleDelay = 0;
let _rttSamples = [];
let _estRTT = 0;
let _minRTT = Infinity;
let _speedSyncActive = false;
let _speedSyncTimeout = null;
let _serverClockOffset = 0;
let _clockOffsetSamples = [];
let _playEmitLast = 0;
let _pauseEmitLast = 0;
let _systemPause = false;
let _userPause = false;
let _userWantsPlay = false;
let _autoResume = false;
let _videoEndedAt = 0;
let _pauseCalledExplicitly = false;
let _bufferPause = false;
let _syncWatchdogArmed = false;
let _syncWatchdogTimer = null;
let _seekEmitLast = 0;
let _pendingHostPlay = false;
let _lastAppliedSeq = -1;
let _pendingChatMsgs = [];
let _chatScheduled = false;
let _scrollScheduled = false;
let _reconnecting = false;
let _pendingProxySeek = null;

// Buffer manager for Local Stream
const bufMgr = {
  startupMinBuf: 10,
  criticalLow: 2,
  safeResume: 5,
  directStartupMinBuf: 5,
  directCriticalLow: 2,
  directSafeResume: 8,
  consecutiveStalls: 0,
  lastStallTime: 0,
  stallCooldown: 30000,
  isStartupBuffering: false,
  isRebuffering: false,
  _stallTimer: null,
};

function recordRTT(ms) {
  if (ms < 0 || ms > 5000) return;
  if (ms < _minRTT) _minRTT = ms;
  _rttSamples.push(ms);
  if (_rttSamples.length > 20) _rttSamples.shift();
  var sorted = _rttSamples.slice().sort(function(a,b){return a-b;});
  _estRTT = sorted[Math.floor(sorted.length/2)] || 0;
}

function applySpeedToSync(driftSeconds) {
  if (_speedSyncActive) return;
  var rate = driftSeconds > 0 ? 1.08 : 0.92;
  video.playbackRate = rate;
  _speedSyncActive = true;
  clearTimeout(_speedSyncTimeout);
  _speedSyncTimeout = setTimeout(function() {
    video.playbackRate = 1.0;
    _speedSyncActive = false;
  }, 1000);
}

function updateClockOffset(savedAt) {
  if (!savedAt) return;
  var now = Date.now();
  var oneWay = Math.min(_minRTT === Infinity ? 50 : _minRTT / 2, (_estRTT || 100) / 2);
  var sample = savedAt + oneWay - now;
  if (Math.abs(sample) > 5) {
    _clockOffsetSamples.push(sample);
    if (_clockOffsetSamples.length > 15) _clockOffsetSamples.shift();
    var sorted = _clockOffsetSamples.slice().sort(function(a,b){return a-b;});
    _serverClockOffset = sorted[Math.floor(sorted.length/2)] || 0;
  }
}

function _compensateViewerTime(t, savedAt, noComp) {
  if (!savedAt) return t;
  var elapsed = Date.now() - savedAt;
  var rtt = Math.min(_estRTT || 100, 1000);
  var oneWay = Math.min(_minRTT === Infinity ? 50 : _minRTT / 2, rtt / 2);
  var clockComp = _serverClockOffset || 0;
  if (noComp) return t + clockComp / 1000;
  return t + (elapsed + oneWay + clockComp) / 1000;
}

// ==================== DOM ====================
const $ = (id) => document.getElementById(id);
const video = $("video");
// Unmute on user interaction (recovery from muted autoplay)
(function() {
  function _ensureAudio() { if (playerType && playerType !== "youtube" && video.muted) video.muted = false; }
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
["loadstart","loadedmetadata","loadeddata","canplay","canplaythrough","play","playing","pause","waiting","stalled","suspend","abort","emptied","seeked","seeking","durationchange","progress","ratechange"].forEach(function(e) {
  video.addEventListener(e, function() { console.log("[video] " + e + (e==="loadedmetadata"?" d:"+video.duration+" "+video.videoWidth+"x"+video.videoHeight:"")); });
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
  if (_directStallTimer) { clearTimeout(_directStallTimer); _directStallTimer = null; }
  if (playerType === "direct" && !$("waitOverlay").classList.contains("hidden") && !bufMgr.isStartupBuffering && !bufMgr.isRebuffering) {
    $("waitOverlay").classList.add("hidden");
  }
});
video.addEventListener("seeked", function() {
  if (_directStallTimer) { clearTimeout(_directStallTimer); _directStallTimer = null; }
});

// ==================== DIAGNOSTIC INSTRUMENTATION ====================
// Logs video state + events to diagnose F5 reconnection choppiness.
// Collects a rolling ring buffer of 1000 events and prints periodic snapshots.
// In viewer, tag is "viewer"; in host, tag is "host".
(function() {
  var _diagEvts = [];
  var _diagTag = isHost ? "host" : "viewer";
  var _diagLast = {};
  var _lastSnap = null;  // last full pipeline snapshot for volumechange comparison
  function _pipelineSnap() {
    var at = video.audioTracks;
    var audioTrackInfo = "none";
    if (at && at.length > 0) { audioTrackInfo = "en=" + at[0].enabled + " l=" + at.length; }
    var snap = {
      t: Date.now(),
      ct: video.currentTime,
      d: video.duration || 0,
      rs: video.readyState,
      ns: video.networkState,
      ps: video.paused,
      sk: video.seeking,
      vol: video.volume,
      muted: video.muted,
      buf: video.buffered.length ? video.buffered.end(video.buffered.length-1) : 0,
      // Chrome pipeline stats
      df: video.webkitDecodedFrameCount || -1,
      dp: video.webkitDroppedFrameCount || -1,
      ad: video.webkitAudioDecodedByteCount || -1,
      vd: video.webkitVideoDecodedByteCount || -1,
      // Audio track
      at: audioTrackInfo,
      // HLS internal buffer
      hlsBuf: (window.hlsInstance && window.hlsInstance.media ? window.hlsInstance.media.buffered.length + " ranges" : "no-hls"),
    };
    // Also check MediaSource readyState if accessible
    if (window.hlsInstance && window.hlsInstance.media && window.hlsInstance.media.src) {
      try {
        var ms = window.hlsInstance.media.src; // might be blob URL
        // MediaSource objects don't expose readyState easily from JS
      } catch(e) {}
    }
    return snap;
  }
  function snapLine(s) {
    return "t=" + s.ct.toFixed(2) + "/" + (s.d?s.d.toFixed(2):"NaN") + " rs=" + s.rs + " ns=" + s.ns + " ps=" + s.ps + " sk=" + s.sk + " vol=" + s.vol + " mute=" + s.muted + " buf=" + s.buf.toFixed(1) + " df=" + s.df + " dp=" + s.dp + " ad=" + s.ad + " vd=" + s.vd + " at=" + s.at + " " + s.hlsBuf;
  }
  function _diag(e, extra) {
    extra = extra || "";
    var s = _pipelineSnap();
    var obj = { t: Date.now(), e: e, extra: extra, s: s };
    _diagEvts.push(obj);
    if (_diagEvts.length > 2000) _diagEvts.shift();
    _diagLast[e] = Date.now();
    _lastSnap = s;
    if (e === "waiting") { window._diagWaitingCount = (window._diagWaitingCount||0) + 1; }
    if (e === "stalled") { window._diagStalledCount = (window._diagStalledCount||0) + 1; }
    console.log("[DIAG-" + _diagTag + "] " + e + extra + " " + snapLine(s));
  }
  // Monitored events (throttled: timeupdate at most every 2s, rest always logged)
  ["seeked","seeking","waiting","stalled","play","playing","pause","canplay","loadedmetadata","emptied","suspend","loadstart"].forEach(function(ev) {
    video.addEventListener(ev, function() { _diag(ev); });
  });
  video.addEventListener("timeupdate", function() {
    if (!_diagLast._lastTu || Date.now() - _diagLast._lastTu > 2000) { _diagLast._lastTu = Date.now(); _diag("timeupdate"); }
  });
  // Volume change: log previous snapshot + current state
  video.addEventListener("volumechange", function() {
    var pre = _lastSnap;
    var post = _pipelineSnap();
    console.log("[DIAG-" + _diagTag + "-VOLUME] PRE:  " + (pre ? snapLine(pre) : "no-prev"));
    console.log("[DIAG-" + _diagTag + "-VOLUME] POST: " + snapLine(post));
    _lastSnap = post;
  });
  // Periodic full-state snapshot every 1 second
  _diag("init", "");
  setInterval(function() {
    var s = _pipelineSnap();
    _lastSnap = s;
    // Also check if HLS internal buffer profile is exposed
    var hlsDetail = "";
    if (window.hlsInstance && window.hlsInstance.stats) {
      try {
        var st = window.hlsInstance.stats;
        hlsDetail = " hlsBufLen=" + (st.bufferLength !== undefined ? st.bufferLength.toFixed(1) : "?") + " hlsTb=" + (st.tBitrate !== undefined ? (st.tBitrate/1000).toFixed(0) : "?");
      } catch(e) {}
    } else if (window.hlsInstance && typeof window.hlsInstance.bufferLength === 'number') {
      hlsDetail = " hlsBufLen=" + window.hlsInstance.bufferLength.toFixed(1);
    }
    console.log("[DIAG-" + _diagTag + "-PERIODIC] " + snapLine(s) + hlsDetail + " w=" + (window._diagWaitingCount||0) + " s=" + (window._diagStalledCount||0));
  }, 1000);
  // Key handler: press D to dump all events, V to dump video element keys
  document.addEventListener("keydown", function(evt) {
    if (evt.key === "d" || evt.key === "D") {
      console.log("[DIAG-" + _diagTag + "-DUMP] Full event log (" + _diagEvts.length + " events):");
      _diagEvts.forEach(function(o) { console.log("  " + new Date(o.t).toISOString().slice(11,23) + " " + o.e + (o.extra?" "+o.extra:"") + " " + snapLine(o.s)); });
    }
    if (evt.key === "v" || evt.key === "V") {
      var v = video;
      var info = {
        currentTime: v.currentTime, duration: v.duration, readyState: v.readyState,
        networkState: v.networkState, paused: v.paused, seeking: v.seeking,
        volume: v.volume, muted: v.muted, playbackRate: v.playbackRate,
        defaultPlaybackRate: v.defaultPlaybackRate,
        videoWidth: v.videoWidth, videoHeight: v.videoHeight,
        error: v.error ? v.error.code : null,
        buffered: v.buffered.length ? v.buffered.end(v.buffered.length-1).toFixed(2) : "0",
        audioTracks: v.audioTracks ? (v.audioTracks.length > 0 ? v.audioTracks[0].enabled + "/" + v.audioTracks.length : "none") : "unsupported",
        webkitDecodedFrames: v.webkitDecodedFrameCount,
        webkitDroppedFrames: v.webkitDroppedFrameCount,
        webkitAudioBytes: v.webkitAudioDecodedByteCount,
        webkitVideoBytes: v.webkitVideoDecodedByteCount,
        src: (v.src || "").substring(0,80),
      };
      console.log("[DIAG-" + _diagTag + "-VIDEO-INFO]", JSON.stringify(info, null, 2));
    }
  });
  // Expose helpers for instrumentation throughout code
  window._diag = _diag;
  window._diagEvts = _diagEvts;
  window._diagTag = _diagTag;
  window._diagCorrections = 0;
  window._diagTimerCount = 0;
  window._diagHlsCount = 0;
  window._diagDashCount = 0;
  window._diagWaitingCount = 0;
  window._diagStalledCount = 0;
  window._pipelineSnap = _pipelineSnap;
  window._snapLine = snapLine;
})();

// Disable buttons until socket connects
createBtn.disabled = true;
createBtn.textContent = "Connecting...";
joinBtn.disabled = true;
joinBtn.textContent = "Connecting...";

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
          var sorted = _clockOffsetSamples.slice().sort(function(a,b){return a-b;});
          _serverClockOffset = sorted[Math.floor(sorted.length/2)] || 0;
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
        console.log("[DIAG-SOCKET-" + window._diagTag + "] <-- " + args[0] + " " + JSON.stringify(args.slice(1)).substring(0,160));
      }
      _orig.call(this, pkt);
    };
  }
  // Try now, and also on every connect
  installSpy();
  socket.on("connect", installSpy);
})();

// ==================== ROOMS ====================
function transitionPage(hideEl, showEl, cb) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    hideEl.classList.add("hidden"); showEl.classList.remove("hidden"); if (cb) cb(); return;
  }
  var overlay = $("pageTransition");
  hideEl.classList.add("page-exit");
  overlay.classList.add("active");
  setTimeout(function () {
    hideEl.classList.add("hidden");
    hideEl.classList.remove("page-exit");
    showEl.classList.remove("hidden");
    showEl.classList.add("page-enter");
    overlay.classList.remove("active");
    setTimeout(function () { showEl.classList.remove("page-enter"); }, 350);
    if (cb) cb();
  }, 350);
}

function createRoom() {
  myName = $("hostName").value.trim() || "Host";
  socket.emit("create", (res) => {
    roomCode = res.code;
    isHost = true;
    if (res.hostToken) {
      sessionStorage.setItem("viewnoveen_hostToken", res.hostToken);
      sessionStorage.setItem("viewnoveen_roomCode", res.code);
      sessionStorage.setItem("viewnoveen_myName", myName);
    }
    enterRoom();
  });
}

function joinRoom() {
  const code = $("roomCode").value.trim().toUpperCase();
  const name = $("joinName").value.trim() || "Anonymous";
  if (!code) return toast("Enter a room code");
  myName = name;
  socket.emit("join", { c: code, n: name }, (res) => {
    _reconnecting = false;
    if (res.err) return toast(res.err);
    roomCode = code;
    isHost = false;
    sessionStorage.removeItem("viewnoveen_hostToken");
    sessionStorage.setItem("viewnoveen_roomCode", code);
    sessionStorage.setItem("viewnoveen_myName", name);
    enterRoom();
    socket.emit("subtitle-check");
  });
}

function rejoinRoom() {
  if (!roomCode) return;
  socket.emit("join", { c: roomCode, n: myName }, (res) => {
    _reconnecting = false;
    if (res.err) {
      toast("Room no longer available.");
      roomCode = null;
      isHost = false;
      transitionPage($("room"), $("landing"));
      $("reconnectBar").classList.add("hidden");
    } else {
      socket.emit("subtitle-check");
    }
  });
}

function reclaimHost(hostToken) {
  if (!roomCode) return;
  var cb = function(res) {
    if (res.err) {
      _reconnecting = false;
      sessionStorage.removeItem("viewnoveen_hostToken");
      toast("Room no longer available.");
      roomCode = null;
      isHost = false;
      transitionPage($("room"), $("landing"));
      $("reconnectBar").classList.add("hidden");
      return;
    }
    // Restore host UI and source
    _reconnecting = false;
    if (res.meta && res.meta.source) {
      if (res.meta.source === "youtube") {
        playerType = "youtube";
        $("uploadArea").classList.add("hidden");
        $("playerArea").classList.remove("hidden");
        $("waitOverlay").classList.add("hidden");
        liveBadge.classList.remove("hidden");
        if (ytApiReady) {
          createYTPlayer(res.meta.videoId);
        } else {
          loadYouTubeAPI();
          ytLoadTimer = setInterval(() => {
            if (ytApiReady) { clearInterval(ytLoadTimer); ytLoadTimer = null; createYTPlayer(res.meta.videoId); }
          }, 200);
        }
      } else if (res.meta.source === "drive") {
    playerType = "drive";
    _lastSrcSetAt = Date.now();
        $("uploadArea").classList.add("hidden");
        $("playerArea").classList.remove("hidden");
        $("waitOverlay").classList.remove("hidden");
        liveBadge.classList.add("hidden");
        video.src = res.meta.directUrl;
        video.load();
      } else if (res.meta.source === "direct") {
        playerType = "direct";
        $("uploadArea").classList.add("hidden");
        $("playerArea").classList.remove("hidden");
        $("waitOverlay").classList.remove("hidden");
        $("waitMsg").textContent = "Loading video...";
        liveBadge.classList.add("hidden");
        video.classList.remove("hidden");
        _lastSrcSetAt = Date.now();
        var proxyUrl = "/proxy?url=" + encodeURIComponent(res.meta.url);
        if (res.meta.isHls && window.Hls && window.Hls.isSupported()) {
          if (window.hlsInstance) { window.hlsInstance.destroy(); }
          var h = new Hls();
          window.hlsInstance = h;
          h.loadSource(proxyUrl);
          h.attachMedia(video);
          video.play().catch(function() {});
        } else if (res.meta.isDash && window.dashjs && window.dashjs.MediaPlayer) {
          if (dashPlayer) { try { dashPlayer.reset(); } catch (e) {} }
          dashPlayer = dashjs.MediaPlayer().create();
          dashPlayer.initialize(video, proxyUrl, true);
        } else {
          video.src = proxyUrl;
          video.load();
          waitForStartupBuffer(function () {
            $("waitOverlay").classList.add("hidden");
            liveBadge.classList.remove("hidden");
            startBufferMonitor();
            if (_pendingHostPlay && video.paused) { _pendingHostPlay = false; video.play().catch(function() {}); }
          });
        }
        $("changeBtn").classList.remove("hidden");
        $("fsBtn").classList.remove("hidden");
      } else if (res.meta.source === "torrent") {
        playerType = "torrent";
        $("uploadArea").classList.add("hidden");
        $("playerArea").classList.remove("hidden");
        $("waitOverlay").classList.remove("hidden");
        $("waitMsg").textContent = "Reconnecting to torrent...";
        video.classList.add("hidden");
        $("youtubePlayer").classList.add("hidden");
        startTorrent(res.meta.torrentId);
      } else if (res.meta.source === "localstream") {
        playerType = "localstream";
        _lastSrcSetAt = Date.now();
        $("uploadArea").classList.add("hidden");
        $("playerArea").classList.remove("hidden");
        $("waitOverlay").classList.remove("hidden");
        $("waitMsg").textContent = "Buffering...";
        liveBadge.classList.add("hidden");
        video.classList.remove("hidden");
        video.src = res.meta.url;
        video.load();
        waitForStartupBuffer(function () {
          $("waitOverlay").classList.add("hidden");
          liveBadge.classList.remove("hidden");
          startBufferMonitor();
        });
      } else if (res.meta.source === "proxy") {
        playerType = "proxy";
        proxyMode = true;
        proxyBuffer = null;
        $("uploadArea").classList.add("hidden");
        $("playerArea").classList.remove("hidden");
        $("waitOverlay").classList.remove("hidden");
        $("waitMsg").textContent = "Reconnecting to stream...";
        liveBadge.classList.add("hidden");
        video.classList.remove("hidden");
        $("youtubePlayer").classList.add("hidden");
        $("waitOverlay").classList.remove("hidden");
        const mime = res.meta.type || "video/mp4";
        if (window.MediaSource && MediaSource.isTypeSupported(mime)) {
          setupMediaSource(mime);
          socket.emit("proxy-play", { url: res.meta.url, startByte: 0, contentType: mime });
        } else {
          proxyBuffer = [];
          useFallback = true;
          socket.emit("proxy-play", { url: res.meta.url, startByte: 0, contentType: mime });
        }
      } else {
        playerType = "upload";
        $("uploadArea").classList.remove("hidden");
        $("uploadStatus").textContent = "MP4, MKV, WebM, MOV";
      }
    } else {
      $("uploadArea").classList.remove("hidden");
      $("uploadStatus").textContent = "MP4, MKV, WebM, MOV";
    }
    // Restore room state
    if (res.state) {
      ignoreNext = true;
      if (res.meta && res.meta.source === "youtube" && ytPlayer && ytPlayer.seekTo) {
        ytPlayer.seekTo(res.state.t, true);
        if (res.state.p) ytPlayer.playVideo();
        else ytPlayer.pauseVideo();
        setTimeout(() => (ignoreNext = false), 1000);
      } else {
        pendingState = { t: res.state.t, p: res.state.p, _seq: -1 };
        // If video metadata already loaded, apply immediately
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          if (res.state.p) {
            video.currentTime = res.state.t;
            video.play().catch(() => {});
          } else {
            video.currentTime = res.state.t;
            if (Date.now() - _lastSrcSetAt > 3000) video.pause();
          }
          pendingState = null;
        }
        setTimeout(() => (ignoreNext = false), 1000);
      }
    }
    // PS2: Restore host identity
    isHost = true;
    transitionPage($("landing"), $("room"));
    $("codeDisplay").textContent = roomCode;
    document.title = "ViewNoveen - " + roomCode;
    $("controls").classList.remove("hidden","viewer");
    $("subUploadBtn").classList.remove("hidden");
    $("subSearchBtn").classList.remove("hidden");
    startSyncTimer();
    loadSubtitle();
  };
  if (hostToken) {
    socket.emit("reclaim-host", roomCode, hostToken, cb);
  } else {
    socket.emit("reclaim-host", roomCode, cb);
  }
}

function enterRoom() {
  transitionPage($("landing"), $("room"));
  $("codeDisplay").textContent = roomCode;
  document.title = `ViewNoveen - ${roomCode}`;

  if (isHost) {
    $("controls").classList.remove("hidden");
    $("uploadArea").classList.remove("hidden");
    $("uploadStatus").textContent = "MP4, MKV, WebM, MOV";
    liveBadge.classList.add("hidden");
    startSyncTimer();
    $("subUploadBtn").classList.remove("hidden");
    $("subSearchBtn").classList.remove("hidden");
  } else {
    $("controls").classList.remove("hidden");
    $("controls").classList.add("viewer");
    $("waitOverlay").classList.remove("hidden");
    $("subUploadBtn").classList.add("hidden");
    $("subSearchBtn").classList.add("hidden");
  }

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set("join", roomCode);
  window.history.replaceState({}, "", url);

  // Focus chat
  $("chatInput").focus();
}

function leaveRoom() {
  intentionalLeave = true;
  _reconnecting = false;
  socket.disconnect();
  sessionStorage.removeItem("viewnoveen_hostToken");
  sessionStorage.removeItem("viewnoveen_roomCode");
  sessionStorage.removeItem("viewnoveen_myName");
  var overlay = $("pageTransition");
  overlay.classList.add("active");
  setTimeout(function () { window.location.href = window.location.origin; }, 400);
}

function copyCode() {
  const url = `${window.location.origin}?join=${roomCode}`;
  const text = `Join my ViewNoveen watch party!\nRoom code: ${roomCode}\n${url}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast("Room code copied!"));
  } else {
    toast(`Room code: ${roomCode}`);
  }
}

// ==================== UPLOAD ====================
$("fileInput").addEventListener("change", function (e) {
  if (!isHost) return;
  const file = e.target.files[0];
  if (!file) return;

  const CHUNK = 64 * 1024;
  const total = Math.ceil(file.size / CHUNK);
  let idx = 0;
  let off = 0;

  socket.emit("meta", {
    n: file.name,
    s: file.size,
    type: file.type || "video/mp4",
    t: total,
  });

  $("uploadStatus").innerHTML = "Uploading... 0%";

  function next() {
    const slice = file.slice(off, off + CHUNK);
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result;
      socket.emit("chunk", { i: idx, t: total, d: new Uint8Array(buf).buffer });
      idx++;
      off += CHUNK;
      const pct = Math.min(100, Math.round((idx / total) * 100));
      $("uploadStatus").innerHTML = `Uploading... ${pct}%`;
      if (idx < total) {
        setTimeout(next, 5);
      } else {
        $("uploadStatus").innerHTML = "Upload complete!";
        // Host plays from local file
        if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
        const url = URL.createObjectURL(file);
        _blobUrl = url;
        video.src = url;
        $("uploadArea").classList.add("hidden");
        $("playerArea").classList.remove("hidden");
        liveBadge.classList.remove("hidden");
        $("changeBtn").classList.remove("hidden");
      }
    };
    reader.readAsArrayBuffer(slice);
  }
  next();
});

// ==================== LOCAL STREAM ====================
$("localStreamInput").addEventListener("change", function (e) {
  if (!isHost) return;
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split(".").pop().toLowerCase();
  if (!["mp4", "mkv", "webm", "mov"].includes(ext)) {
    return toast("Unsupported file type. Use MP4, MKV, WebM, or MOV.");
  }

  if (file.size > 5 * 1024 * 1024 * 1024) {
    return toast("File too large. Maximum size is 5GB.");
  }

  $("localStreamFileName").textContent = file.name;
  $("localStreamProgress").classList.remove("hidden");
  $("localStreamProgressText").textContent = "Uploading... 0%";
  $("localStreamProgressBar").style.width = "0%";

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload?filename=" + encodeURIComponent(file.name) + "&room=" + encodeURIComponent(roomCode), true);
  xhr.setRequestHeader("Content-Type", "application/octet-stream");

  xhr.upload.onprogress = function (ev) {
    if (ev.lengthComputable) {
      const pct = Math.round((ev.loaded / ev.total) * 100);
      $("localStreamProgressText").textContent = "Uploading... " + pct + "%";
      $("localStreamProgressBar").style.width = pct + "%";
    }
  };

  xhr.onload = function () {
    if (xhr.status === 200) {
      try {
        var res = JSON.parse(xhr.responseText);
      } catch (e) {
        toast("Invalid server response.");
        $("localStreamInput").disabled = false;
        $("localStreamProgress").classList.add("hidden");
        return;
      }
      if (!res || !res.url) { toast("Server returned incomplete data."); $("localStreamInput").disabled = false; $("localStreamProgress").classList.add("hidden"); return; }
      $("localStreamProgressText").textContent = "Upload complete!";
      $("localStreamProgressBar").style.width = "100%";
      playerType = "localstream";
      _lastSrcSetAt = Date.now();
      video.src = res.url;
      video.load();
      $("uploadArea").classList.add("hidden");
      $("playerArea").classList.remove("hidden");
      $("waitOverlay").classList.remove("hidden");
      $("waitMsg").textContent = "Buffering...";
      liveBadge.classList.add("hidden");
      $("changeBtn").classList.remove("hidden");
      socket.emit("meta", { source: "localstream", url: res.url, name: file.name });
      waitForStartupBuffer(function () {
        $("waitOverlay").classList.add("hidden");
        liveBadge.classList.remove("hidden");
        startBufferMonitor();
      });
    } else {
      toast("Upload failed: " + (xhr.statusText || "Unknown error"));
      $("localStreamProgressText").textContent = "Upload failed";
    }
  };

  xhr.onerror = function () {
    toast("Upload failed. Check your connection.");
    $("localStreamProgressText").textContent = "Upload failed";
  };

  xhr.send(file);
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
  if (_st !== 'localstream' && _st !== 'direct') { callback(); return; }
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
      if (_startupCanPlayThrough) { video.removeEventListener('canplaythrough', _startupCanPlayThrough); _startupCanPlayThrough = null; }
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
      if (_startupCanPlayThrough) { video.removeEventListener('canplaythrough', _startupCanPlayThrough); _startupCanPlayThrough = null; }
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
        if (playerType !== _st) { bufMgr.isRebuffering = false; return; }
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
  if (playerType === "direct") { changeVideo(); return; }
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
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
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
  if (_directStallTimer) { clearTimeout(_directStallTimer); _directStallTimer = null; }
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
  if (_syncWatchdogTimer) { clearTimeout(_syncWatchdogTimer); _syncWatchdogTimer = null; }
  removeSubtitle();
  if (window.hlsInstance) { window.hlsInstance.destroy(); window.hlsInstance = null; }
  if (dashPlayer) { try { dashPlayer.reset(); } catch (e) {} dashPlayer = null; }
  socket.emit("reset");
  $("controls").classList.remove("show");
  $("changeBtn").classList.add("hidden");
  $("playerArea").classList.add("hidden");
  $("youtubePlayer").classList.add("hidden");
  $("directIframe").classList.add("hidden");
  $("directIframe").src = "";
  if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
  video.classList.remove("hidden");
  $("playBtn").classList.remove("hidden");
  $("seekbar").classList.remove("hidden");
  $("timeDisplay").classList.remove("hidden");
  $("uploadArea").classList.remove("hidden");
  $("uploadStatus").textContent = "MP4, MKV, WebM, MOV";
  liveBadge.classList.add("hidden");
  if (iptvChannels.length) { $("iptvSearchInput").classList.remove("hidden"); selectSource("iptv"); }
  else { selectSource("upload"); }
  $("fileInput").value = "";
  $("youtubeInput").value = "";
  $("driveInput").value = "";
  $("directInput").value = "";
  $("localStreamInput").value = "";
  $("localStreamProgress").classList.add("hidden");
  $("localStreamFileName").textContent = "";
  if (torrentClient && torrentObj) { torrentObj.destroy(); torrentObj = null; }
  scheduleOverlayTimeout();
}

// ==================== SUBTITLE UPLOAD ====================
$("subInput").addEventListener("change", function (e) {
  if (!isHost) return;
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function() {
    socket.emit("subtitle-upload", { name: file.name, content: reader.result });
    // Load locally for host
    subtitleCues = parseVTT(
      file.name.toLowerCase().endsWith('.srt')
        ? reader.result.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/^(\d+)\n(?=\d{1,2}:\d{2})/gm,'').replace(/(\d+),(\d{3})/g,'$1.$2')
        : reader.result
    );
    subtitleDelay = 0;
    applySubtitle();
    $('subFileName').textContent = file.name;
    $('subFileName').classList.remove('hidden');
    $('subDelayDown').classList.remove('hidden');
    $('subDelayDisplay').classList.remove('hidden');
    $('subDelayUp').classList.remove('hidden');
    $('subDelayDisplay').textContent = '0';
  };
  reader.readAsText(file);
});

// ==================== SYNC TIMER ====================
// Start periodic sync-state emission (host only). Call whenever a player becomes active.
function startSyncTimer() {
  if (syncTimer) { clearInterval(syncTimer); console.log("[DIAG-" + window._diagTag + "] startSyncTimer: cleared previous timer"); }
  window._diagTimerCount = (window._diagTimerCount||0) + 1;
  console.log("[DIAG-" + window._diagTag + "] startSyncTimer: new timer #" + window._diagTimerCount + " playerType=" + playerType);
  var _lastSyncT = -1;
  var _lastSyncP = null;
  syncTimer = setInterval(() => {
    if (playerType === "youtube" && ytPlayer && ytPlayer.getCurrentTime) {
      var ytT = ytPlayer.getCurrentTime();
      var ytP = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
      if (ytT !== _lastSyncT || ytP !== _lastSyncP) {
        _lastSyncT = ytT; _lastSyncP = ytP;
        socket.emit("sync-state", { t: ytT, p: ytP, savedAt: Date.now() });
      }
    } else if (video.duration) {
      var p = !video.paused;
      if (isHost && video.ended && Date.now() - _videoEndedAt < 5000) p = true;
      var ct = video.currentTime;
      if (Math.abs(ct - _lastSyncT) > 0.1 || p !== _lastSyncP) {
        _lastSyncT = ct; _lastSyncP = p;
        socket.emit("sync-state", { t: ct, p: p, savedAt: Date.now() });
      }
    }
  }, 1000);
}

// Emit sync-state immediately when host tab becomes visible
document.addEventListener('visibilitychange', function() {
  if (document.hidden) return;
  if (isHost) {
    if (playerType !== "youtube" && video.duration) {
      if (video.paused && _userWantsPlay) {
        video.play().catch(function(){});
        socket.emit("play", _compensateViewerTime(video.currentTime, null, false));
      } else {
        socket.emit("sync-state", { t: video.currentTime, p: !video.paused, savedAt: Date.now() });
      }
    }
  } else if (roomCode && playerType) {
    socket.emit("sync-request");
  }
});

// ==================== SUBTITLES ====================
function parseVTTTime(str) {
  var parts = str.trim().split(':');
  if (parts.length === 3) return parseFloat(parts[0])*3600 + parseFloat(parts[1])*60 + parseFloat(parts[2].replace(',','.'));
  return parseFloat(parts[0])*60 + parseFloat(parts[1].replace(',','.'));
}

function formatVTTTime(t) {
  if (t < 0) t = 0;
  var h = Math.floor(t/3600);
  var m = Math.floor((t%3600)/60);
  var s = t%60;
  return (h<10?'0':'')+h+':'+(m<10?'0':'')+m+':'+(s<10?'0':'')+s.toFixed(3);
}

function parseVTT(vtt) {
  var cues = [];
  var lines = vtt.split('\n');
  var i = 0;
  // Skip WEBVTT header and metadata
  while (i < lines.length && !lines[i].includes('-->')) i++;
  for (; i < lines.length; i++) {
    var m = lines[i].match(/([\d:.]+)\s*-->\s*([\d:.]+)(.*)/);
    if (!m) continue;
    var start = parseVTTTime(m[1]);
    var end = parseVTTTime(m[2]);
    var settings = (m[3]||'').trim();
    i++;
    var text = '';
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
      text += (text ? '\n' : '') + lines[i];
      i++;
    }
    cues.push({ start: start, end: end, text: text, settings: settings });
  }
  return cues;
}

function generateVTT(cues, delay) {
  var vtt = 'WEBVTT\n\n';
  for (var ci = 0; ci < cues.length; ci++) {
    var c = cues[ci];
    var s = c.start + delay;
    var e = c.end + delay;
    if (s < 0) continue;
    vtt += formatVTTTime(s) + ' --> ' + formatVTTTime(e);
    if (c.settings) vtt += ' ' + c.settings;
    vtt += '\n' + c.text + '\n\n';
  }
  return vtt;
}

function applySubtitle() {
  if (!subtitleCues.length) return;
  var old = document.getElementById('subtitleTrack');
  if (old) { if (old.src) URL.revokeObjectURL(old.src); old.remove(); }
  var vtt = generateVTT(subtitleCues, subtitleDelay);
  var blob = new Blob([vtt], { type: 'text/vtt' });
  var url = URL.createObjectURL(blob);
  var track = document.createElement('track');
  track.id = 'subtitleTrack';
  track.kind = 'subtitles';
  track.label = 'Subtitles';
  track.src = url;
  track.default = true;
  video.appendChild(track);
  if (track.track) track.track.mode = 'showing';
}

function loadSubtitle() {
  fetch('/subtitle/' + roomCode).then(function(r) {
    if (!r.ok) throw new Error('Subtitle fetch failed');
    return r.text();
  }).then(function(vtt) {
    subtitleCues = parseVTT(vtt);
    subtitleDelay = 0;
    applySubtitle();
    $('subFileName').textContent = 'CC';
    $('subFileName').classList.remove('hidden');
    $('subDelayDown').classList.remove('hidden');
    $('subDelayDisplay').classList.remove('hidden');
    $('subDelayUp').classList.remove('hidden');
    $('subDelayDisplay').textContent = '0';
  }).catch(function(e) {
    console.log('[subtitle] load error:', e.message);
    toast("Failed to load subtitle: " + e.message);
  });
}

function removeSubtitle() {
  var track = document.getElementById('subtitleTrack');
  if (track) { if (track.src) URL.revokeObjectURL(track.src); track.remove(); }
  subtitleCues = [];
  subtitleDelay = 0;
  $('subFileName').classList.add('hidden');
  $('subDelayDown').classList.add('hidden');
  $('subDelayDisplay').classList.add('hidden');
  $('subDelayUp').classList.add('hidden');
}

function adjustSubDelay(delta) {
  subtitleDelay += delta / 1000;
  if (subtitleDelay < -60) subtitleDelay = -60;
  if (subtitleDelay > 60) subtitleDelay = 60;
  $('subDelayDisplay').textContent = Math.round(subtitleDelay * 1000);
  if (subtitleCues.length) applySubtitle();
}

// ==================== SUBTITLE SEARCH ====================
function toggleSubSearch() {
  var dlg = $("subSearchDialog");
  var wasHidden = dlg.classList.contains("hidden");
  dlg.classList.toggle("hidden");
  if (wasHidden) {
    $("subSearchQuery").value = "";
    $("subSearchStatus").style.display = "none";
    $("subSearchResults").innerHTML = "";
    setTimeout(function() { $("subSearchQuery").focus(); }, 100);
  }
}

function searchSubtitles() {
  var query = $("subSearchQuery").value.trim();
  if (!query) return;
  var lang = $("subSearchLang").value;
  var apiKey = $("subSearchKey").value.trim() || undefined;
  showSubSearchStatus("Searching...", false);
  $("subSearchResults").innerHTML = "";
  socket.emit("search-subtitles", { query: query, language: lang, apiKey: apiKey });
}

function showSubSearchStatus(msg, isError) {
  var el = $("subSearchStatus");
  el.textContent = msg;
  el.style.display = "block";
  el.style.color = isError ? "var(--accent)" : "var(--text-muted)";
}

function showSubSearchResults(results) {
  var container = $("subSearchResults");
  $("subSearchStatus").style.display = "none";
  if (!results.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No subtitles found. Try a different title or language.</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    html += '<div class="sub-search-result" data-fileid="' + r.fileId + '" onclick="selectSubtitle(this)" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:var(--radius);cursor:pointer;background:var(--surface-elevated);transition:background .15s;border:1px solid var(--border)">';
    html += '<span style="font-weight:700;font-size:13px;color:var(--text);min-width:36px">' + esc(r.language) + '</span>';
    html += '<span style="flex:1;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.title) + (r.year ? ' (' + r.year + ')' : '') + '</span>';
    html += '<span style="font-size:11px;color:var(--text-muted);white-space:nowrap">' + r.downloads + ' dl</span>';
    if (r.rating > 0) html += '<span style="font-size:11px;color:var(--text-muted)">&#9733; ' + r.rating.toFixed(1) + '</span>';
    html += '<span style="font-size:16px;color:var(--primary)">&#x279C;</span>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function selectSubtitle(el) {
  var fileId = el.getAttribute("data-fileid");
  if (!fileId) return;
  var apiKey = $("subSearchKey").value.trim() || undefined;
  showSubSearchStatus("Downloading...", false);
  $("subSearchResults").innerHTML = "";
  socket.emit("download-subtitle", { fileId: parseInt(fileId, 10), apiKey: apiKey });
}

function applyDownloadedSubtitle(vtt) {
  subtitleCues = parseVTT(vtt);
  subtitleDelay = 0;
  applySubtitle();
  $('subFileName').textContent = 'Search';
  $('subFileName').classList.remove('hidden');
  $('subDelayDown').classList.remove('hidden');
  $('subDelayDisplay').classList.remove('hidden');
  $('subDelayUp').classList.remove('hidden');
  $('subDelayDisplay').textContent = '0';
  // Upload to server for viewers via existing subtitle-upload event
  socket.emit("subtitle-upload", { name: 'search.vtt', content: vtt });
  // Close dialog
  $("subSearchDialog").classList.add("hidden");
  toast("Subtitle loaded from search");
}
// ==================== END SUBTITLE SEARCH ====================

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
  setTimeout(() => { _inFullscreenTransition = false; }, 300);
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
  setTimeout(() => { _inFullscreenTransition = false; }, 300);
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
    setTimeout(function() { localSeek = false; }, 300);
  }
}

function togglePlay() {
  _systemPause = false;
  if (playerType === "youtube" && ytPlayer) {
    var ps = ytPlayer.getPlayerState();
    if (ps === YT.PlayerState.PLAYING) { ytPlayer.pauseVideo(); }
    else { ytPlayer.playVideo(); }
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
      socket.emit("play", _compensateViewerTime(video.currentTime, null, false));
    }
    video.play().catch(function(){});
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
      if (t >= buffered.start(i) && t <= buffered.end(i)) { inBuffer = true; break; }
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
    if (wasPlaying) video.play().catch(function(){});
  } else {
    video.currentTime = t;
    if (wasPlaying) video.play().catch(function(){});
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
  playBtn.innerHTML = "\u25B6\uFE0E";
  if (_autoResume) { _autoResume = false; return; }
  if (isHost && !localSeek && !ignoreNext && !_inFullscreenTransition && playerType !== "youtube" && !bufMgr.isRebuffering) {
    var now = Date.now();
    if (now - _playEmitLast < 300) return;
    _playEmitLast = now;
    socket.emit("play", _compensateViewerTime(video.currentTime, null, false));
  }
});

video.addEventListener("pause", () => {
  playBtn.innerHTML = "\u25B6";
  if (_systemPause) { _systemPause = false; _userWantsPlay = true; return; }
  if (video.ended && isHost) { _videoEndedAt = Date.now(); }
  if (_bufferPause) {
    _bufferPause = false;
    _pauseCalledExplicitly = false;
    return;
  }
  if (_pauseCalledExplicitly) {
    _pauseCalledExplicitly = false;
    _userWantsPlay = false;
    if (_userPause) { _userPause = false; }
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
      if (ytApiReady) { clearInterval(ytLoadTimer); ytLoadTimer = null; createYTPlayer(videoId); }
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
  allBtn.onclick = () => { iptvSelectedGroup = ""; document.querySelectorAll("#iptvGroups .btn").forEach(b => b.classList.remove("active")); allBtn.classList.add("active"); renderIptvChannels(); };
  container.appendChild(allBtn);
  groups.forEach(g => {
    const count = iptvChannels.filter(c => c.group === g).length;
    const btn = document.createElement("button");
    btn.className = "btn btn-glass";
    btn.style.cssText = "padding:3px 10px;font-size:11px";
    btn.textContent = g + " (" + count + ")";
    btn.onclick = () => { iptvSelectedGroup = g; document.querySelectorAll("#iptvGroups .btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); renderIptvChannels(); };
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
  allBtn.onclick = () => { iptvSelectedGroup = ""; container.querySelectorAll(".btn").forEach(b => b.classList.remove("active")); allBtn.classList.add("active"); renderIptvChOverlay(); };
  container.appendChild(allBtn);
  groups.forEach(g => {
    const count = iptvChannels.filter(c => c.group === g).length;
    const btn = document.createElement("button");
    btn.className = "btn btn-glass";
    btn.style.cssText = "padding:3px 10px;font-size:11px";
    btn.textContent = g + " (" + count + ")";
    btn.onclick = () => { iptvSelectedGroup = g; container.querySelectorAll(".btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); renderIptvChOverlay(); };
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

socket.on("iptv-channel", ({ url, name, logo }) => {
  if (isHost) return;
  // "meta" event from the host's startDirect handles setupDirectPlayback
});

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
    if (window.hlsInstance) { window.hlsInstance.destroy(); }
    var h = new Hls();
    window._diagHlsCount = (window._diagHlsCount||0) + 1;
    window.hlsInstance = h;
    h.loadSource(proxyUrl);
    h.attachMedia(video);
    h.on(Hls.Events.MANIFEST_PARSED, function() {
      $("waitOverlay").classList.add("hidden");
      liveBadge.classList.remove("hidden");
    });
    video.play().catch(function() {});
  } else if (isDash && window.dashjs && window.dashjs.MediaPlayer) {
    if (dashPlayer) { try { dashPlayer.reset(); } catch (e) {} }
    dashPlayer = dashjs.MediaPlayer().create();
    window._diagDashCount = (window._diagDashCount||0) + 1;
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
      if (_pendingHostPlay && video.paused) { _pendingHostPlay = false; video.play().catch(function() {}); }
    });
  }
}

function startDirect(url) {
  console.log("[DIAG-" + window._diagTag + "] startDirect url=" + url.substring(0,80));
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
  if (torrentObj) { torrentObj.destroy(); torrentObj = null; }
  torrentClient.add(torrentId, { announce: [] }, (torrent) => {
    torrentObj = torrent;
    const file = torrent.files.find((f) => f.name.match(/\.(mp4|mkv|webm|mov|avi|m4v)$/i));
    if (!file) { toast("No playable video file found in torrent"); return; }
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
  torrentClient.on("error", (err) => { toast("Torrent error: " + err.message); });
}

// ==================== YOUTUBE API ====================
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) { ytApiReady = true; return; }
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.getElementsByTagName("script")[0].parentNode.insertBefore(tag, document.getElementsByTagName("script")[0]);
}

window.onYouTubeIframeAPIReady = function () { ytApiReady = true; };

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
      onReady() { onYTReady(); },
      onStateChange(e) { onYTStateChange(e); },
    },
  });
}

function destroyYTPlayer() {
  if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) {} ytPlayer = null; }
  if (ytInterval) { clearInterval(ytInterval); ytInterval = null; }
  if (ytLoadTimer) { clearInterval(ytLoadTimer); ytLoadTimer = null; }
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

// ==================== SOCKET EVENTS ====================
socket.on("meta", (m) => {
  videoMeta = m;
  pendingState = null;
  scheduleOverlayTimeout();
  destroyYTPlayer();
  if (ytInterval) { clearInterval(ytInterval); ytInterval = null; }
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
        if (ytApiReady) { clearInterval(ytLoadTimer); ytLoadTimer = null; createYTPlayer(m.videoId); }
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
    if (!m.url || m.url.trim() === '' || m.url === 'undefined') { console.warn("meta direct: empty/undefined url, ignoring"); return; }
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
    if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
    const blob = new Blob(proxyBuffer, { type: videoMeta ? videoMeta.type || "video/mp4" : "video/mp4" });
    var url = URL.createObjectURL(blob);
    _blobUrl = url;
    video.src = url;
    $("waitOverlay").classList.add("hidden");
    liveBadge.classList.remove("hidden");
    proxyBuffer = null;
  } else if (proxyMode && ms && ms.readyState === "open") {
    try { ms.endOfStream(); } catch (e) {}
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
  if (!playerType || bufMgr.isRebuffering) return;
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
  if (!playerType || bufMgr.isRebuffering || (isHost && !_inFullscreenTransition)) return;
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
  if (!playerType || (isHost && !_inFullscreenTransition)) return;
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
    if (wasPlaying) video.play().catch(function(){});
  }
});

socket.on("sync-state", ({ t, p, _seq, savedAt }) => {
  console.log("VIEWER EVENT: sync-state", {t, p, _seq, savedAt, videoCT: video.currentTime, videoPaused: video.paused, videoEnded: video.ended});
  if (isHost || !playerType) return;
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
  } else if (!p && !video.paused) { video.pause(); }
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
  if (ytInterval) { clearInterval(ytInterval); ytInterval = null; }
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
  if (dashPlayer) { try { dashPlayer.reset(); } catch (e) {} dashPlayer = null; }
  if (torrentClient && torrentObj) { torrentObj.destroy(); torrentObj = null; }
  if (window.hlsInstance) { window.hlsInstance.destroy(); window.hlsInstance = null; }
  pendingState = null;
  ytJustLoaded = false;
  localSeek = false;
  playerType = null;
  directPlaying = false;
  $("controls").classList.remove("show","viewer");
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

// ==================== MEDIASOURCE ====================
function setupMediaSource(mime) {
  if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
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
  if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
  const blob = new Blob(blobs, { type: videoMeta.type || "video/mp4" });
  const url = URL.createObjectURL(blob);
  _blobUrl = url;
  video.src = url;
  $("playerArea").classList.remove("hidden");
  $("waitOverlay").classList.add("hidden");
  liveBadge.classList.remove("hidden");
  $("uploadArea").classList.add("hidden");
}

// ==================== CHAT ====================
function sendChat() {
  const input = $("chatInput");
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit("chat", { n: myName, m: msg });
  input.value = "";
  input.focus();
}

function addChatMsg(name, msg) {
  const el = document.createElement("div");
  el.className = "msg";
  const nameSpan = document.createElement("span");
  nameSpan.className = "name";
  nameSpan.style.color = nameColor(name);
  nameSpan.textContent = name;
  const textSpan = document.createElement("span");
  textSpan.className = "text";
  textSpan.textContent = msg;
  const timeSpan = document.createElement("span");
  timeSpan.className = "time";
  const t = new Date();
  timeSpan.textContent = t.getHours().toString().padStart(2, "0") + ":" + t.getMinutes().toString().padStart(2, "0");
  el.appendChild(nameSpan);
  el.appendChild(textSpan);
  el.appendChild(timeSpan);
  var container = $("chatMessages");
  container.appendChild(el);
  while (container.children.length > 200) container.removeChild(container.firstChild);
  var fsMsgs = $("fsChatMessages");
  if (fsMsgs && fsMsgs.parentElement.classList.contains("show")) {
    var clone = el.cloneNode(true);
    fsMsgs.appendChild(clone);
    while (fsMsgs.children.length > 200) fsMsgs.removeChild(fsMsgs.firstChild);
  }
}

function flushChatMessages() {
  _chatScheduled = false;
  var q = _pendingChatMsgs;
  _pendingChatMsgs = [];
  var batch = q.splice(0, 20);
  for (var i = 0; i < batch.length; i++) {
    addChatMsg(batch[i].n, batch[i].m);
  }
  if (q.length > 0) {
    _pendingChatMsgs = q.concat(_pendingChatMsgs);
    _chatScheduled = true;
    setTimeout(flushChatMessages, 0);
  } else {
    scheduleChatScroll();
  }
}

function scheduleChatScroll() {
  if (_scrollScheduled) return;
  _scrollScheduled = true;
  setTimeout(function() {
    _scrollScheduled = false;
    var container = $("chatMessages");
    container.scrollTop = container.scrollHeight;
    var fsMsgs = $("fsChatMessages");
    if (fsMsgs && fsMsgs.parentElement.classList.contains("show")) {
      fsMsgs.scrollTop = fsMsgs.scrollHeight;
    }
  });
}

function nameColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue},65%,65%)`;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});
document.getElementById("fsChatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendFsChat();
});
document.getElementById("subSearchQuery").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchSubtitles();
});

// ==================== UI ====================
function toggleChat() {
  const cs = $("chatSection");
  cs.classList.toggle("collapsed");
  $("chatToggleBtn").textContent = cs.classList.contains("collapsed") ? "\u25B2" : "\u2715";
}

function toggleFsChat() {
  const panel = $("fsChatPanel");
  const isOpen = panel.classList.toggle("show");
  if (isOpen) {
    const msgs = $("fsChatMessages");
    msgs.innerHTML = "";
    const src = $("chatMessages");
    for (let i = 0; i < src.children.length; i++) {
      msgs.appendChild(src.children[i].cloneNode(true));
    }
    msgs.scrollTop = msgs.scrollHeight;
    clearTimeout(_fsControlsTimer);
    $("controls").classList.remove("show");
    $("fsChatInput").focus();
  } else {
    resetFsControlsTimer();
  }
}

function sendFsChat() {
  const input = $("fsChatInput");
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit("chat", { n: myName, m: msg });
  input.value = "";
  input.focus();
}

let toastTimer = null;

function toast(msg, duration) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  if (duration !== 0) {
    toastTimer = setTimeout(() => el.classList.remove("show"), duration || 3000);
  }
}

function hideToast() {
  const el = $("toast");
  el.classList.remove("show");
  clearTimeout(toastTimer);
}

// Mobile keyboard handling via visualViewport
if (window.visualViewport) {
  var adjustForKeyboard = function () {
    var cs = $("chatSection");
    if (!cs) return;
    if (window.innerWidth > 768) { cs.style.bottom = ""; return; }
    var vv = window.visualViewport;
    var offset = window.innerHeight - vv.height - vv.offsetTop;
    if (offset > 50) {
      cs.style.bottom = offset + "px";
    } else {
      cs.style.bottom = "";
    }
  };
  window.visualViewport.addEventListener("resize", adjustForKeyboard);
  window.visualViewport.addEventListener("scroll", adjustForKeyboard);
}


// Auto-join from URL (with PS2 host reclaim)
window.addEventListener("DOMContentLoaded", () => {
  const p = new URLSearchParams(window.location.search);
  const c = p.get("join");
  if (c) {
    var code = c.toUpperCase();
    $("roomCode").value = code;
    var token = sessionStorage.getItem("viewnoveen_hostToken");
    var savedCode = sessionStorage.getItem("viewnoveen_roomCode");
    var savedName = sessionStorage.getItem("viewnoveen_myName");
    // If we have a stored host token and it matches this room, reclaim host role
    if (token && savedCode === code) {
      _reconnecting = true;
      roomCode = code;
      myName = savedName || "Host";
      $("joinName").value = myName;
      var doReclaim = function() { reclaimHost(token); };
      if (connected) {
        doReclaim();
      } else {
        socket.on("connect", doReclaim);
        setTimeout(function() {
          socket.off("connect", doReclaim);
          if (!connected) toast("Connection timeout. Please try again.");
        }, 15000);
      }
    } else {
      _reconnecting = true;
      $("joinName").value = "Viewer";
      if (connected) {
        joinRoom();
      } else {
        const autoJoin = () => { socket.off("connect", autoJoin); joinRoom(); };
        socket.on("connect", autoJoin);
        setTimeout(function() {
          socket.off("connect", autoJoin);
          if (!connected) toast("Connection timeout. Please try again.");
        }, 15000);
      }
    }
  }
});

// GSAP ScrollTrigger landing animation (Image Zoom — YzbPYMx)
try {
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && typeof gsap !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    var stgs = { trigger: '.wrapper', start: 'top top', end: '+=80%', pin: true, scrub: true };
    function safeScale(v) { return isFinite(v) && v > 0 ? v : 1 }
    function initZoom() {
      var wrap = document.querySelector('.wrapper');
      if (!wrap || wrap._gsapInited) return;
      wrap._gsapInited = true;
      var mm = gsap.matchMedia();
      mm.add('(min-width: 769px)', function() {
        gsap.timeline({ scrollTrigger: stgs })
          .to('#landingBgVideo', { scale: safeScale(2.5), z: 400, transformOrigin: 'center center', ease: 'power1.inOut' })
          .to('.hero-title', { opacity: 0.7, y: -18, scale: 0.96, ease: 'power1.inOut' }, '<')
          .to('.hero-tagline', { opacity: 0.5, y: -8, ease: 'power1.inOut' }, '<')
          .to('.hero-forms', { opacity: 0.4, y: -6, ease: 'power1.inOut' }, '<');
      });
      mm.add('(max-width: 768px)', function() {
        gsap.timeline({ scrollTrigger: stgs })
          .to('#landingBgVideo', { scale: safeScale(2), z: 200, transformOrigin: 'center center', ease: 'power1.inOut' })
          .to('.hero-title', { opacity: 0.8, y: -12, scale: 0.97, ease: 'power1.inOut' }, '<')
          .to('.hero-tagline', { opacity: 0.6, y: -6, ease: 'power1.inOut' }, '<');
      });
      gsap.set('.feature-item', { y: 60, opacity: 0 });
      gsap.to('.feature-item', {
        scrollTrigger: { trigger: '.landing-features', start: 'top 85%', once: true },
        y: 0, opacity: 1, duration: 0.7, stagger: 0.12, ease: 'power2.out'
      });
    }
    if (document.readyState === 'complete') { initZoom() } else { window.addEventListener('load', initZoom) }
    document.fonts && document.fonts.ready && document.fonts.ready.then(function(){ ScrollTrigger.refresh() });
    var _rs = ScrollTrigger.refresh.bind(ScrollTrigger);
    ScrollTrigger.refresh = function() { try { _rs() } catch(e) {} };
  }
} catch(e) {}
