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
  var sorted = _rttSamples.slice().sort(function(a, b) {
    return a - b;
  });
  _estRTT = sorted[Math.floor(sorted.length / 2)] || 0;
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
    var sorted = _clockOffsetSamples.slice().sort(function(a, b) {
      return a - b;
    });
    _serverClockOffset = sorted[Math.floor(sorted.length / 2)] || 0;
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

