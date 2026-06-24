// ==================== DIAGNOSTIC INSTRUMENTATION ====================
// Logs video state + events to diagnose F5 reconnection choppiness.
// Collects a rolling ring buffer of 1000 events and prints periodic snapshots.
// In viewer, tag is "viewer"; in host, tag is "host".
(function() {
  var _diagEvts = [];
  var _diagTag = isHost ? "host" : "viewer";
  var _diagLast = {};
  var _lastSnap = null; // last full pipeline snapshot for volumechange comparison
  function _pipelineSnap() {
    var at = video.audioTracks;
    var audioTrackInfo = "none";
    if (at && at.length > 0) {
      audioTrackInfo = "en=" + at[0].enabled + " l=" + at.length;
    }
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
      buf: video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0,
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
      } catch (e) {}
    }
    return snap;
  }
  function snapLine(s) {
    return "t=" + s.ct.toFixed(2) + "/" + (s.d ? s.d.toFixed(2) : "NaN") + " rs=" + s.rs + " ns=" + s.ns + " ps=" + s.ps + " sk=" + s.sk + " vol=" + s.vol + " mute=" + s.muted + " buf=" + s.buf.toFixed(1) + " df=" + s.df + " dp=" + s.dp + " ad=" + s.ad + " vd=" + s.vd + " at=" + s.at + " " + s.hlsBuf;
  }
  function _diag(e, extra) {
    extra = extra || "";
    var s = _pipelineSnap();
    var obj = { t: Date.now(), e: e, extra: extra, s: s };
    _diagEvts.push(obj);
    if (_diagEvts.length > 2000) _diagEvts.shift();
    _diagLast[e] = Date.now();
    _lastSnap = s;
    if (e === "waiting") {
      window._diagWaitingCount = (window._diagWaitingCount || 0) + 1;
    }
    if (e === "stalled") {
      window._diagStalledCount = (window._diagStalledCount || 0) + 1;
    }
    console.log("[DIAG-" + _diagTag + "] " + e + extra + " " + snapLine(s));
  }
  // Monitored events (throttled: timeupdate at most every 2s, rest always logged)
  ["seeked", "seeking", "waiting", "stalled", "play", "playing", "pause", "canplay", "loadedmetadata", "emptied", "suspend", "loadstart"].forEach(function(ev) {
    video.addEventListener(ev, function() {
      _diag(ev);
    });
  });
  video.addEventListener("timeupdate", function() {
    if (!_diagLast._lastTu || Date.now() - _diagLast._lastTu > 2000) {
      _diagLast._lastTu = Date.now(); _diag("timeupdate");
    }
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
        hlsDetail = " hlsBufLen=" + (st.bufferLength !== undefined ? st.bufferLength.toFixed(1) : "?") + " hlsTb=" + (st.tBitrate !== undefined ? (st.tBitrate / 1000).toFixed(0) : "?");
      } catch (e) {}
    } else if (window.hlsInstance && typeof window.hlsInstance.bufferLength === 'number') {
      hlsDetail = " hlsBufLen=" + window.hlsInstance.bufferLength.toFixed(1);
    }
    console.log("[DIAG-" + _diagTag + "-PERIODIC] " + snapLine(s) + hlsDetail + " w=" + (window._diagWaitingCount || 0) + " s=" + (window._diagStalledCount || 0));
  }, 1000);
  // Key handler: press D to dump all events, V to dump video element keys
  document.addEventListener("keydown", function(evt) {
    if (evt.key === "d" || evt.key === "D") {
      console.log("[DIAG-" + _diagTag + "-DUMP] Full event log (" + _diagEvts.length + " events):");
      _diagEvts.forEach(function(o) {
        console.log("  " + new Date(o.t).toISOString().slice(11, 23) + " " + o.e + (o.extra ? " " + o.extra : "") + " " + snapLine(o.s));
      });
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
        buffered: v.buffered.length ? v.buffered.end(v.buffered.length - 1).toFixed(2) : "0",
        audioTracks: v.audioTracks ? (v.audioTracks.length > 0 ? v.audioTracks[0].enabled + "/" + v.audioTracks.length : "none") : "unsupported",
        webkitDecodedFrames: v.webkitDecodedFrameCount,
        webkitDroppedFrames: v.webkitDroppedFrameCount,
        webkitAudioBytes: v.webkitAudioDecodedByteCount,
        webkitVideoBytes: v.webkitVideoDecodedByteCount,
        src: (v.src || "").substring(0, 80),
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
    setTimeout(function () {
      showEl.classList.remove("page-enter");
    }, 350);
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
            if (ytApiReady) {
              clearInterval(ytLoadTimer); ytLoadTimer = null; createYTPlayer(res.meta.videoId);
            }
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
          if (window.hlsInstance) {
            window.hlsInstance.destroy();
          }
          var h = new Hls();
          window.hlsInstance = h;
          h.loadSource(proxyUrl);
          h.attachMedia(video);
          video.play().catch(function() {});
        } else if (res.meta.isDash && window.dashjs && window.dashjs.MediaPlayer) {
          if (dashPlayer) {
            try {
              dashPlayer.reset();
            } catch (e) {}
          }
          dashPlayer = dashjs.MediaPlayer().create();
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
    $("controls").classList.remove("hidden", "viewer");
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
  setTimeout(function () {
    window.location.href = window.location.origin;
  }, 400);
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
        if (_blobUrl) {
          URL.revokeObjectURL(_blobUrl); _blobUrl = null;
        }
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
      if (!res || !res.url) {
        toast("Server returned incomplete data."); $("localStreamInput").disabled = false; $("localStreamProgress").classList.add("hidden"); return;
      }
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
        ? reader.result.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^(\d+)\n(?=\d{1,2}:\d{2})/gm, '').replace(/(\d+),(\d{3})/g, '$1.$2')
        : reader.result,
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
  if (syncTimer) {
    clearInterval(syncTimer); console.log("[DIAG-" + window._diagTag + "] startSyncTimer: cleared previous timer");
  }
  window._diagTimerCount = (window._diagTimerCount || 0) + 1;
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
        video.play().catch(function() {});
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
  if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'));
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
}

function formatVTTTime(t) {
  if (t < 0) t = 0;
  var h = Math.floor(t / 3600);
  var m = Math.floor((t % 3600) / 60);
  var s = t % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
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
    var settings = (m[3] || '').trim();
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
  if (old) {
    if (old.src) URL.revokeObjectURL(old.src); old.remove();
  }
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
  if (track) {
    if (track.src) URL.revokeObjectURL(track.src); track.remove();
  }
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
    setTimeout(function() {
      $("subSearchQuery").focus();
    }, 100);
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
    if (window.innerWidth > 768) {
      cs.style.bottom = ""; return;
    }
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
      var doReclaim = function() {
        reclaimHost(token);
      };
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
        const autoJoin = () => {
          socket.off("connect", autoJoin); joinRoom();
        };
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
    function safeScale(v) {
      return isFinite(v) && v > 0 ? v : 1;
    }
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
        y: 0, opacity: 1, duration: 0.7, stagger: 0.12, ease: 'power2.out',
      });
    }
    if (document.readyState === 'complete') {
      initZoom();
    } else {
      window.addEventListener('load', initZoom);
    }
    document.fonts && document.fonts.ready && document.fonts.ready.then(function() {
      ScrollTrigger.refresh();
    });
    var _rs = ScrollTrigger.refresh.bind(ScrollTrigger);
    ScrollTrigger.refresh = function() {
      try {
        _rs();
      } catch (e) {}
    };
  }
} catch (e) {}
