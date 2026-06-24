# Mobile UX Audit — ViewNoveen

**Date:** 2026-06-15
**Target viewports (CSS breakpoints):** ≤900px (tablets), ≤768px (phones), ≤480px (small phones), ≤360px (very small)
**Current layout:** Desktop: sidebar chat (320px) + video. Mobile (≤768px): 60vh video + 40vh chat, fixed fill.

---

## 1. Findings

### A. Safe-Area / Notch / Cutout Support — MISSING

No `env(safe-area-inset-*)` or `constant(safe-area-inset-*)` anywhere. On notched iPhones or Android-punch-hole devices:

| Element | Issue |
|---------|-------|
| `.room-header` | `position:absolute; top:0` — hidden behind status bar / notch. Padding is 6–8px, not safe-area-aware. |
| `.controls` | `padding:40px 8px 8px` — bottom-safe-area not accounted for. Home indicator overlaps controls on iPhone X+. |
| `.chat-section` | Bottom padding not safe-area-aware. Chat input near home indicator. |
| `#toast` | `bottom:16px` — overlaps home indicator. |
| `.room-content` | No safe-area padding on left/right edges. |

### B. Source Selector Overflows (Mobile)

`#sourceSelector` on mobile has 8 buttons side-by-side with `display:flex; gap:8px; justify-content:center`:
```
[Upload] [YouTube] [Drive] [VK] [Archive] [Direct] [VLC] [Local Stream]
```
These will overflow on any screen <600px. No CSS wrapping, no scroll container, no responsive reduction.

### C. Controls Bar Crowded (Poor Density)

Full controls set on mobile (≤768px):
```
[▶] [-5] [+5] [====seekbar====] [0:00/0:00] [LIVE] [↻] [⛶] [💬] [CC] [S] [filename] [-500] [0] [+500]
```
**15 interactive elements** in a bar only 40px tall. At ≤480px buttons are 34×34px with 6px gaps — this overflows. Subtitle controls are always hidden by default (`.hidden` class), but when active they push the total past the available width.

### D. Touch Targets Below Minimum Size

| Breakpoint | Button size | Recommended minimum |
|------------|-------------|-------------------|
| ≤768px | 40×40px | 44×44px (iOS HIG) |
| ≤480px | 34×34px | 44×44px |
| ≤360px | 30×30px | 44×44px |
| Seekbar thumb | 20×20px | 44×44px |

All breakpoints except the widest mobile (768px) have undersized touch targets.

### E. No Landscape Optimization

The 60vh/40vh split is designed for portrait. In landscape (common for video watching):
- 60vh video is fine (fills most of the screen height)
- But the chat section at 40vh is too tall and unnecessary in landscape
- Controls are at the bottom of the 60vh video area, which is fine, but there's no full-screen-video-in-landscape mode
- Landscape source selector is even more cramped horizontally

### F. Chat Close/Collapse Is Non-Functional

- `.chat-header button` has `display:none` on desktop
- `toggleChat()` toggles a `.collapsed` class that has zero CSS rules applied (no width change, no display change)
- The close/collapse button has no visible effect

### G. Virtual Keyboard Not Handled

Mobile chat input has no `visualViewport` handling. When the keyboard opens:
- The chat input at the bottom of the 40vh panel may be pushed behind the keyboard
- No scroll-into-view behavior
- No resize event handling to adjust layout

### H. Overscroll / Scroll Chaining Not Prevented

- `.chat-msgs` has `overflow-y:auto` but no `overscroll-behavior:contain`
- `body` only has `overflow:hidden` — iOS Safari still allows rubber-banding
- Controls and video section don't prevent scroll chaining

### I. Double-Tap Zoom Not Disabled

- No `touch-action:manipulation` on controls or buttons
- On iOS Safari, double-tap can zoom the page even with `user-scalable=no` missing
- 300ms tap delay may still affect some interactions

### J. One-Handed Operation Not Considered

- Controls are evenly spread across the full bar width
- Play/pause, seekbar, time display, and 15+ other elements compete for space
- Common controls (play/pause, -5/+5) are on the left, which is the hardest thumb zone on large phones
- Seekbar is in the middle, requiring a full-hand reach
- No bottom-sheet or thumb-zone-optimized layout

### K. Fullscreen Chat Panel on Mobile

- `#fsChatPanel` at ≤768px becomes `width:100%!important` — good for full-width
- But there's no close button with safe-area-inset support
- The chat message list could be behind the notch/status bar
- No scroll anchoring for new messages

### L. Toast Overlaps Critical Areas

- `#toast` at `bottom:16px` — sits right where the home indicator is on iPhones
- At ≤768px, it's at `bottom:16px` with `max-width:90vw` — still overlaps safe-area
- No safe-area-aware bottom offset

---

## 2. Recommended Changes

### Priority: P0 (Critical — usability breaking)

| # | Change | Location | Risk |
|---|--------|----------|------|
| 1 | Add `env(safe-area-inset-*)` padding to: header top, controls bottom, chat bottom, toast bottom | CSS `:root` + media queries | Low — additive padding only |
| 2 | Add `touch-action: manipulation` to `body`, buttons, and controls to disable double-tap zoom | CSS body + .controls button | Low — standard best practice |
| 3 | Add `overscroll-behavior: contain` to `.chat-msgs`, `.room-content` | CSS | Low — prevents scroll chaining |

### Priority: P1 (High impact — important for daily use)

| # | Change | Location | Risk |
|---|--------|----------|------|
| 4 | Increase touch targets to ≥44px at all breakpoints where possible | CSS .controls button, .seek-btn, seekbar thumb | Low — size increase only |
| 5 | Wrap source selector buttons or use horizontal scroll container with `overflow-x:auto` | CSS for ≤768px | Low — layout change, no logic |
| 6 | Add landscape media query (`orientation: landscape` and/or `max-height: 500px`): reduce video to 40vh, hide chat by default or make collapsible | New CSS section | Medium — chat visibility change |
| 7 | Implement `visualViewport` resize handler to scroll chat input into view when keyboard opens | New JS function | Medium — JS addition, no existing logic changes |

### Priority: P2 (Medium impact — polish and convenience)

| # | Change | Location | Risk |
|---|--------|----------|------|
| 8 | Collapse subtitle controls into a single toggle button on mobile (hide the -500/0/+500 row until expanded) | CSS + JS for sub-controls | Medium — changes subtitle button logic |
| 9 | Optimize controls bar for one-handed use: group primary controls (▶, -5, +5, seekbar) on the left half | CSS layout | Medium — control reordering |
| 10 | Make chat collapse actually work: add `.chat-section.collapsed { display:none }` or width reduction CSS | CSS | Low — currently broken, fixing it restores intended behavior |
| 11 | Add `overscroll-behavior: contain` to video section to prevent iOS rubber-banding | CSS | Low |
| 12 | Apply safe-area-aware toast positioning with proper fallback | CSS | Low |

### Priority: P3 (Low — nice to have)

| # | Change | Location | Risk |
|---|--------|----------|------|
| 13 | Add swipe gesture for seek (-5/+5) on video | New JS | Medium — new gesture logic |
| 14 | Auto-hide controls after 3s on mobile, tap to show | New JS + CSS animation | Medium — changes controls show/hide behavior |
| 15 | Add haptic feedback on button press (navigator.vibrate) | JS | Low — enhancement only |
| 16 | Use system font on chat inputs for better IME integration | CSS | Low |

---

## 3. Risk Assessment

### Low-Risk Items (recommended for immediate implementation)
- **Safe-area padding** (P0-1, 2, 3, 12): Purely additive CSS changes. No JS changes. Cannot break existing behavior. Falls back gracefully on non-notch devices.
- **Touch-action** (P0-2): Disables zoom on controls. Browsers without touch-action support simply ignore it.
- **Overscroll-behavior** (P0-3, P1-11): Prevents scroll chaining. Non-supporting browsers (older Safari) ignore it.
- **Touch target sizes** (P1-4): Pure CSS resize. Seekbar thumb already uses CSS for sizing.
- **Chat collapse fix** (P2-10): Adds one CSS rule for `.collapsed`. Currently the class has zero effect, so any CSS at all is an improvement.

### Medium-Risk Items (need careful implementation)
- **Source selector wrapping** (P1-5): May need to test on various source button counts. The inline HTML uses `style="width:auto;padding:8px 20px"` which would need to be overridden in mobile CSS.
- **Landscape mode** (P1-6): Changes the visible layout significantly. Chat hidden by default in landscape could confuse users. Need a button to re-open chat.
- **Keyboard handling** (P1-7): New JS with `visualViewport` API. Not all browsers support it (fallback needed). Must not fire during orientation change.
- **Subtitle controls collapse** (P2-8): Changes the behavior of subtitle delay adjustment on mobile. Need to ensure delay adjustment still works with one tap.
- **Controls reordering** (P2-9): Changes DOM order of elements. Need to ensure accessibility (tab order) is preserved. Seekbar receives focus correctly.

### No-Go Items (for this phase)
- **Swipe gestures** (P3-13): Would require new touch event handlers that could conflict with existing `togglePlay()`, seekbar, and scroll behavior. Higher risk than justified.
- **Auto-hide controls** (P3-14): Changes the fundamental mobile UX pattern. Currently controls are `opacity:1!important` on mobile — making them auto-hide is a design decision that should be user-tested first.

---

## 4. Test Plan

### Manual Test Scenarios

| # | Scenario | Devices | Pass Criteria |
|---|----------|---------|---------------|
| 1 | Host creates room, viewer joins on mobile | iPhone 14, Pixel 7 | Room loads without overflow, header visible below notch |
| 2 | Play video on mobile | iPhone SE, Galaxy S22 | Controls visible, touch targets respond |
| 3 | Tap -5 and +5 buttons | All mobile | Seek fires, time updates, viewer syncs |
| 4 | Press play/pause | All mobile | Video plays/pauses, button icon updates |
| 5 | Drag seekbar thumb | All mobile | Thumb is big enough to grab (>20px), seek fires |
| 6 | Send chat message | iPhone keyboard | Chat input not hidden behind keyboard, message sends |
| 7 | Rotate to landscape | All mobile | Layout adapts, video fills more screen, chat accessible |
| 8 | Fullscreen toggle | iOS Safari, Chrome | `#playerArea` fills screen, `fsChatPanel` opens full-width |
| 9 | Open subtitle search | All mobile | Dialog fits viewport, inputs usable |
| 10 | Leave room | All mobile | Returns to landing, no stuck state |

### Automated Test Coverage

| # | Test | Coverage | Notes |
|---|------|----------|-------|
| 1 | test-direct.js | Direct MP4/HLS, F5 recovery | Unchanged from baseline |
| 2 | test-direct2.js | Timeline polling | Unchanged from baseline |
| 3 | test-direct3.js | Meta emission | Unchanged from baseline |
| 4 | Visual regression | CSS breakpoints | None exist — would need Percy/Screenshot tests |
| 5 | Touch event simulation | Puppeteer touchscreen emulation | Not currently covered |

### Regression Checklist

- [ ] No new console errors in index.html
- [ ] All existing test-direct*.js tests PASS
- [ ] Sync behavior unchanged (stutter=0, corrections=0)
- [ ] F5 recovery unchanged (zero-time samples same as baseline)
- [ ] Reconnect behavior unchanged (reclaimHost/rejoinRoom works)
- [ ] Subtitle synchronization unchanged (cues based on currentTime)
- [ ] Fullscreen behavior unchanged (request/exit fullscreen events)
- [ ] Desktop layout unchanged (>900px breakpoints not touched)

---

## Implementation Order

```
Phase A (P0 items — safe-area, touch-action, overscroll):
  → PR: 3 CSS changes, zero risk
  → Verify: no visual change on desktop, no errors on mobile

Phase B (P1 items — touch targets, source selector wrap, landscape):
  → PR: CSS + 1 new JS function (visualViewport)
  → Verify: all manual test scenarios, regression suite

Phase C (P2 items — subtitle collapse, one-handed controls, chat fix):
  → PR: CSS + minor JS for subtitle collapse toggle
  → Verify: subtitle delay still works on mobile, chat collapse works
```
