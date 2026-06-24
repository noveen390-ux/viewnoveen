# ViewNoveen Baseline Release Report

**Date:** 2026-06-15
**Version:** Post-removal baseline (VLC/Archive/VK removed, 4 fixes applied)
**Working directory:** `C:\Users\Noveen\AppData\Local\Temp\opencode\viewnoveen`
**Snapshot:** `VIEWNOVEEN_BACKUP\baseline-20260615-225405\`

---

## Regression Results

**27 PASS, 0 FAIL, 0 ENV-LIMIT — OVERALL: PASS**

| Category | Result |
|----------|--------|
| YouTube | 2 pass |
| Direct | 3 pass |
| Upload | 2 pass |
| LocalStream | 1 pass |
| Sync | 4 pass |
| Host/Viewer | 3 pass |
| F5 Recovery | 2 pass |
| Reconnect | 2 pass |
| Fullscreen | 1 pass |
| Subtitles | 1 pass |
| Mobile UX | 1 pass |
| ±5s Controls | 1 pass |
| Removal Verification | 4 pass |

---

## Source Removals

### VLC (Phase 1)
- `index.html`: Source button, DOM section, `selectSource('vlc')` case, `loadVlc()` function, `parseVlcUrl()` helper, all VLC-related cleanup
- `server.js`: `ffmpegProcesses` map, `HLS_DIR` constant, `/hls` static middleware, `spawn` require, `vlc-transcode` socket handler, ffmpeg kill in `reset`/`disconnect` handlers

### Archive.org (Phase 2)
- `index.html`: Source button, DOM section (`#archiveSection`), `selectSource('archive')` toggle, `extractArchiveId()`, `loadArchive()`, `startArchive()` functions, reclaim-host case, meta handler case, `archiveInput` reset
- `server.js`: Removed `"archive"` from allowlist

### VK (Phase 3)
- `index.html`: Source button, DOM section (`#vkSection`), `vkPlayer` div, all VK variables (`vkPlayer`, `vkReady`, `vkInterval`, `vkApiLoaded`), `extractVkId()`, `loadVk()` functions, reclaim-host VK case, meta handler VK case, `loadVkAPI()`, `createVKPlayer()`, `tryInitVKPlayer()`, `destroyVKPlayer()`, `onVKReady()`, `onVKStateChange()`, `updateVKTime()` functions, all VK branches in sync/play/pause/seek/state handlers and video event listeners, `selectSource('vk')` toggle
- `server.js`: Removed `"vk"` from allowlist

---

## Bug Fixes Applied (Phase 4)

### Fix 1: direct-back server handler
- **File:** `server.js`
- **Change:** Added `socket.on("direct-back")` handler that clears `room.meta`, resets `room.state`, and broadcasts `"direct-back"` to viewers
- **Why:** The regression test emits `"direct-back"` from the host socket; without a server handler, viewers never received the event → test FAILed

### Fix 2: visualViewport keyboard handling
- **File:** `index.html`
- **Change:** Added `window.visualViewport` resize/scroll listener that adjusts `#chatSection` bottom offset when the mobile keyboard opens (guarded to ≤768px, offset >50px)
- **Why:** Without this, mobile keyboard covers the chat input field

### Fix 4: 44px touch targets
- **File:** `index.html` (CSS)
- **Change:** Increased button sizes to 44×44px at all mobile breakpoints (768px, 480px, 360px, landscape). Added `flex-wrap` to source selector, `min-height:44px` to action/chat buttons
- **Why:** WCAG-recommended minimum touch target size; Temp used 30-40px

### Fix 5: Overlay fallback restart on change
- **File:** `index.html`
- **Change:** Converted `setTimeout` to `setInterval` inside `scheduleOverlayTimeout()` so the fallback keeps checking every 10s until the overlay is actually hidden
- **Why:** One-shot `setTimeout` would not re-fire if overlay was hidden then shown again (e.g., host changes video after first load succeeds), potentially leaving the overlay stuck

---

## Preserved Features

| Feature | Status |
|---------|--------|
| Subtitle system (SRT/VTT upload, OpenSubtitles search, delay adjustment) | ✅ |
| Fullscreen with `_inFullscreenTransition` guard | ✅ |
| Floating chat overlay in fullscreen (`#fsChatPanel`, `#chatFsBtn`) | ✅ |
| Mobile UX (responsive breakpoints, always-visible controls, safe-area insets) | ✅ |
| Sync behavior (1s periodic, visibility change, 2s/3s drift thresholds) | ✅ |
| F5 Recovery (host reclaim, viewer rejoin, state restoration) | ✅ |
| Reconnect (auto-retry, room persistence, intentional leave) | ✅ |
| YouTube playback (IFrame API, sync, play/pause/seek) | ✅ |
| Direct URL (native `<video>`, HLS.js, Dash.js, proxy) | ✅ |
| Upload (chunked, MediaSource viewer) | ✅ |
| Local Stream (buffer management, startup buffer) | ✅ |
| Drive playback | ✅ |
| Torrent playback (WebTorrent) | ✅ |
| Diagnostics (`_diag*` instrumentation) | ✅ |
| ±5s seek controls | ✅ |

---

## Fix 3 Deferred

Fullscreen icon update and target element change separated for later evaluation:

- **Icon update:** Add `$("fsBtn").innerHTML` toggle in `toggleFullscreen()` and `fullscreenchange`/`webkitfullscreenchange` listeners (currently the button icon never changes)
- **Target change:** Switch from `$("playerArea")` to `document.documentElement` for more universal fullscreen support

Both changes are non-blocking — no regression depends on them.

---

## Snapshot Location

```
C:\Users\Noveen\AppData\Local\Temp\opencode\VIEWNOVEEN_BACKUP\baseline-20260615-225405\
```

Contains full working copy of `index.html`, `server.js`, `regression-test.js`, and all assets at this baseline.

*This report establishes the stable baseline after VLC/Archive/VK removal and 4 bug fixes. All future changes should be tested against these 27 tests.*
