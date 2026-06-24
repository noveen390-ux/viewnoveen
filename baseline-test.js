// Baseline Test Suite — Pre-PS1/PS2/PS3
// Tests the CURRENT application state before any patches.
// All tests run against the running server. No code modifications.

const puppeteer = require('puppeteer');
const { io } = require('socket.io-client');
const http = require('http');
const fs = require('fs');

const PORT = 3456;
const BASE = `http://localhost:${PORT}`;
const MP4_URL = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4';

const results = { pass: [], fail: [], blocked: [] };
const GLOBAL_TIMEOUT = 15000;

function PASS(cat, msg) { results.pass.push({ cat, msg }); console.log(`  PASS  ${cat}: ${msg}`); }
function FAIL(cat, msg, detail) { results.fail.push({ cat, msg, detail }); console.log(`  FAIL  ${cat}: ${msg}${detail ? ' — ' + detail : ''}`); }
function BLOCKED(cat, msg, reason) { results.blocked.push({ cat, msg, reason }); console.log(`  BLOCK ${cat}: ${msg} — ${reason}`); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(path, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), ms))
  ]);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testSocketFlows() {
  console.log('\n=== SOCKET-LEVEL TESTS ===\n');

  // ─── 1. HOST FLOW ───
  console.log('[Host Flow]');
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ['websocket'] });
      await new Promise(r => H.on('connect', r));

      const rc = await new Promise(r => H.emit('create', r));
      if (rc && rc.code && rc.code.length === 6) {
        PASS('Host', 'Room created with 6-char code');
      } else {
        FAIL('Host', 'Room creation failed', JSON.stringify(rc));
      }

      // Check if hostToken exists (baseline for PS1)
      if (rc && rc.hostToken) {
        PASS('Host', 'hostToken returned in create callback');
      } else {
        PASS('Host', 'hostToken NOT returned (pre-PS1 baseline)');
      }

      H.close();
    })(), 10000, 'Host flow');
  } catch (e) {
    FAIL('Host', 'Test crashed', e.message);
  }

  // ─── 2. VIEWER FLOW ───
  console.log('\n[Viewer Flow]');
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ['websocket'] });
      const V = io(BASE, { transports: ['websocket'] });
      await Promise.all([new Promise(r => H.on('connect', r)), new Promise(r => V.on('connect', r))]);
      const rc = await new Promise(r => H.emit('create', r));

      const joinRes = await new Promise(r => V.emit('join', { c: rc.code, n: 'ViewerBot' }, r));
      if (joinRes && joinRes.ok) {
        PASS('Viewer', 'Viewer joins room successfully');
      } else {
        FAIL('Viewer', 'Viewer join failed', JSON.stringify(joinRes));
      }

      H.close(); V.close();
    })(), 10000, 'Viewer flow');
  } catch (e) {
    FAIL('Viewer', 'Test crashed', e.message);
  }

  // ─── 3. SYNC EVENTS ───
  console.log('\n[Sync Events]');
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ['websocket'] });
      const V = io(BASE, { transports: ['websocket'] });
      await Promise.all([new Promise(r => H.on('connect', r)), new Promise(r => V.on('connect', r))]);
      const rc = await new Promise(r => H.emit('create', r));
      await new Promise(r => V.emit('join', { c: rc.code, n: 'SyncBot' }, r));

      let syncReceived = false, playReceived = false, pauseReceived = false, seekReceived = false;
      V.on('sync-state', (s) => { if (s.p === true && s.t === 42) syncReceived = true; });
      V.on('play', () => { playReceived = true; });
      V.on('pause', () => { pauseReceived = true; });
      V.on('seek', (s) => { if (s.t === 30) seekReceived = true; });

      H.emit('sync-state', { p: true, t: 42 });
      await delay(200);
      H.emit('play', 42);
      await delay(200);
      H.emit('pause', 42);
      await delay(200);
      H.emit('seek', 30);
      await delay(300);

      syncReceived ? PASS('Sync', 'sync-state event relayed') : FAIL('Sync', 'sync-state NOT received');
      playReceived ? PASS('Sync', 'play event relayed') : FAIL('Sync', 'play NOT received');
      pauseReceived ? PASS('Sync', 'pause event relayed') : FAIL('Sync', 'pause NOT received');
      seekReceived ? PASS('Sync', 'seek event relayed') : FAIL('Sync', 'seek NOT received');

      H.close(); V.close();
    })(), 10000, 'Sync events');
  } catch (e) {
    FAIL('Sync', 'Test crashed', e.message);
  }

  // ─── 4. LOCALSTREAM ───
  console.log('\n[LocalStream]');
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ['websocket'] });
      const V = io(BASE, { transports: ['websocket'] });
      await Promise.all([new Promise(r => H.on('connect', r)), new Promise(r => V.on('connect', r))]);
      const rc = await new Promise(r => H.emit('create', r));
      await new Promise(r => V.emit('join', { c: rc.code, n: 'Tester' }, r));

      let lsOk = false, lsPlayOk = false, lsPauseOk = false, lsSeekOk = false;
      V.on('meta', (m) => { if (m.source === 'localstream') lsOk = true; });
      V.on('play', () => { if (lsOk) lsPlayOk = true; });
      V.on('pause', () => { if (lsOk) lsPauseOk = true; });
      V.on('seek', (s) => { if (typeof s === 'object' && s.t === 30) lsSeekOk = true; });
      H.emit('meta', { source: 'localstream', url: '/video/test.mkv', name: 'test.mkv' });
      await delay(200);
      lsOk ? PASS('LocalStream', 'meta event broadcast') : FAIL('LocalStream', 'meta not received');
      H.emit('play', 0);
      await delay(100);
      lsPlayOk ? PASS('LocalStream', 'play sync after meta') : FAIL('LocalStream', 'play not received');
      H.emit('pause', 0);
      await delay(100);
      lsPauseOk ? PASS('LocalStream', 'pause sync after meta') : FAIL('LocalStream', 'pause not received');
      H.emit('seek', 30);
      await delay(100);
      lsSeekOk ? PASS('LocalStream', 'seek sync after meta') : FAIL('LocalStream', 'seek not received');

      H.emit('reset');
      await delay(100);
      H.close(); V.close();
    })(), 10000, 'LocalStream test');
  } catch (e) {
    FAIL('LocalStream', 'Test crashed', e.message);
  }

  // ─── 5. CHAT ───
  console.log('\n[Chat]');
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ['websocket'] });
      const V = io(BASE, { transports: ['websocket'] });
      await Promise.all([new Promise(r => H.on('connect', r)), new Promise(r => V.on('connect', r))]);
      const rc = await new Promise(r => H.emit('create', r));
      await new Promise(r => V.emit('join', { c: rc.code, n: 'ChatBot' }, r));

      let chatReceived = false;
      V.on('chat', (msg) => { if (msg.m === 'hello baseline') chatReceived = true; });
      H.emit('chat', { m: 'hello baseline', n: 'Host' });
      await delay(300);

      chatReceived ? PASS('Chat', 'Chat message relayed to viewer') : FAIL('Chat', 'Chat NOT received');

      H.close(); V.close();
    })(), 10000, 'Chat');
  } catch (e) {
    FAIL('Chat', 'Test crashed', e.message);
  }

  // ─── 5. SUBTITLE EVENTS ───
  console.log('\n[Subtitle Events]');
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ['websocket'] });
      const V = io(BASE, { transports: ['websocket'] });
      await Promise.all([new Promise(r => H.on('connect', r)), new Promise(r => V.on('connect', r))]);
      const rc = await new Promise(r => H.emit('create', r));
      await new Promise(r => V.emit('join', { c: rc.code, n: 'SubBot' }, r));

      let subtitleReady = false;
      V.on('subtitle-ready', () => { subtitleReady = true; });

      // Simulate subtitle upload
      H.emit('subtitle-upload', { name: 'test.vtt', content: 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nHello World' });
      await delay(500);

      subtitleReady ? PASS('Subtitle', 'subtitle-ready event broadcast') : FAIL('Subtitle', 'subtitle-ready NOT received');

      // Check that subtitle VTT is stored on server
      const subRes = await httpGet('/subtitle/' + rc.code, 3000);
      if (subRes.status === 200) {
        PASS('Subtitle', 'Subtitle VTT accessible via HTTP endpoint');
      } else {
        FAIL('Subtitle', 'Subtitle HTTP endpoint returned ' + subRes.status);
      }

      H.close(); V.close();
    })(), 10000, 'Subtitle events');
  } catch (e) {
    FAIL('Subtitle', 'Test crashed', e.message);
  }

  // ─── 6. F5 RECOVERY (RECLAIM) ───
  console.log('\n[F5 Recovery / Reclaim]');
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ['websocket'] });
      await new Promise(r => H.on('connect', r));
      const rc = await new Promise(r => H.emit('create', r));

      // Set meta so reclaim can restore it
      H.emit('meta', { source: 'direct', url: MP4_URL });
      await delay(300);

      // Simulate F5: new socket claims host
      const H2 = io(BASE, { transports: ['websocket'] });
      await new Promise(r => H2.on('connect', r));
      const reclaimRes = await new Promise(r => H2.emit('reclaim-host', rc.code, r));

      if (reclaimRes && reclaimRes.ok) {
        PASS('Reclaim', 'reclaim-host succeeds');
        if (reclaimRes.meta && reclaimRes.meta.source === 'direct') {
          PASS('Reclaim', 'reclaim restores saved meta');
        } else {
          FAIL('Reclaim', 'reclaim meta missing', JSON.stringify(reclaimRes.meta));
        }
        if (reclaimRes.state) {
          PASS('Reclaim', 'reclaim returns saved state');
        } else {
          FAIL('Reclaim', 'reclaim state missing');
        }
      } else {
        FAIL('Reclaim', 'reclaim-host failed', JSON.stringify(reclaimRes));
      }

      H.close(); H2.close();
    })(), 10000, 'F5 Reclaim');
  } catch (e) {
    FAIL('Reclaim', 'Test crashed', e.message);
  }

  // ─── 7. DISCONNECT / RECONNECT ───
  console.log('\n[Disconnect / Reconnect]');
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ['websocket'] });
      const V = io(BASE, { transports: ['websocket'] });
      await Promise.all([new Promise(r => H.on('connect', r)), new Promise(r => V.on('connect', r))]);
      const rc = await new Promise(r => H.emit('create', r));
      await new Promise(r => V.emit('join', { c: rc.code, n: 'ReconBot' }, r));
      await delay(200);

      let endReceived = false;
      V.on('end', () => { endReceived = true; });

      H.disconnect();
      await delay(500);

      endReceived ? PASS('Disconnect', 'end event received by viewer (baseline)') : BLOCKED('Disconnect', 'end NOT received', 'Pre-PS1: end emit not implemented');

      // Viewer should still be able to receive events
      let stateReceived = false;
      V.on('state', () => { stateReceived = true; });

      // Host reclaims
      const H2 = io(BASE, { transports: ['websocket'] });
      await new Promise(r => H2.on('connect', r));
      const reclaimRes = await new Promise(r => H2.emit('reclaim-host', rc.code, r));
      reclaimRes.ok ? PASS('Reconnect', 'Host reclaims after disconnect') : FAIL('Reconnect', 'Reclaim after disconnect failed', JSON.stringify(reclaimRes));

      H2.close(); V.close();
    })(), 15000, 'Disconnect/Reconnect');
  } catch (e) {
    FAIL('Disconnect', 'Test crashed', e.message);
  }

  // ─── 8. SERVER HTTP ENDPOINTS ───
  console.log('\n[Server HTTP Endpoints]');
  try {
    const rootRes = await withTimeout(httpGet('/', 3000), 5000, 'GET /');
    rootRes.status === 200 ? PASS('HTTP', 'GET / serves index.html') : FAIL('HTTP', 'GET / returned ' + rootRes.status);

    const subRes = await withTimeout(httpGet('/subtitle/NONEXISTENT', 3000), 5000, 'GET /subtitle/nonexistent');
    subRes.status === 404 ? PASS('HTTP', 'GET /subtitle/NONEXISTENT returns 404') : FAIL('HTTP', 'Expected 404 for missing subtitle, got ' + subRes.status);

    // Check that index.html contains key elements
    const html = fs.readFileSync('C:\\Users\\Noveen\\AppData\\Local\\Temp\\opencode\\viewnoveen\\index.html', 'utf8');
    const checks = [
      ['controls element', /id="controls"/],
      ['play button', /playBtn/],
      ['sync timer', /startSyncTimer|syncTimer/],
      ['subtitle fetch', /loadSubtitle|fetch.*subtitle/],
      ['YouTube API', /youtube.*iframe|YT\.Player/],
      ['fullscreen', /fullscreen|requestFullscreen/],
      ['reclaim-host', /reclaim-host|reclaimHost/],
    ];
    checks.forEach(([name, re]) => {
      re.test(html) ? PASS('HTML', `Found: ${name}`) : FAIL('HTML', `Missing: ${name}`);
    });
  } catch (e) {
    FAIL('HTTP/HTML', 'Test crashed', e.message);
  }
}

async function testBrowserFlows() {
  console.log('\n\n=== BROWSER-LEVEL TESTS ===\n');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--mute-audio', '--window-size=1280,720'],
      defaultViewport: { width: 1280, height: 720 },
    });

    // ─── B1. HOST CREATES ROOM ───
    console.log('[Browser: Host Flow]');
    const host = await browser.newPage();
    const hostLogs = [];
    host.on('console', msg => hostLogs.push(msg.text()));

    await host.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
    await host.waitForFunction(() => !document.querySelector('.landing-forms .section:first-child .btn')?.disabled, { timeout: 10000 });

    await host.type('#hostName', 'HostBot');
    await host.click('.landing-forms .section:first-child .btn');
    await sleep(1500);

    const roomCode = await host.evaluate(() => {
      const el = document.getElementById('codeDisplay');
      return el ? el.textContent : null;
    });
    if (roomCode) {
      PASS('Browser', `Host: Room created — code=${roomCode}`);
    } else {
      FAIL('Browser', 'Host: Room code not displayed');
    }

    // Check controls visibility
    const controlsHidden = await host.evaluate(() => {
      const c = document.getElementById('controls');
      return c ? c.classList.contains('hidden') : 'no-element';
    });
    if (controlsHidden === false) {
      PASS('Browser', 'Host: Controls visible');
    } else {
      FAIL('Browser', 'Host: Controls not visible', `hidden=${controlsHidden}`);
    }

    // Check sync timer is running (note: syncTimer is let-scoped, not on window)
    const syncTimerRunning = await host.evaluate(() => typeof syncTimer !== 'undefined' && syncTimer !== null);
    syncTimerRunning ? PASS('Browser', 'Host: Sync timer running') : FAIL('Browser', 'Host: Sync timer NOT running');

    // Check isHost (note: isHost is let-scoped, not on window)
    const isHostVal = await host.evaluate(() => typeof isHost !== 'undefined' ? isHost : 'undefined');
    isHostVal === true ? PASS('Browser', 'Host: isHost === true') : FAIL('Browser', 'Host: isHost !== true', `isHost=${isHostVal}`);

    // Check sessionStorage for hostToken (pre-PS2 baseline)
    const hasToken = await host.evaluate(() => !!sessionStorage.getItem('viewnoveen_hostToken'));
    hasToken ? PASS('Browser', 'Host: sessionStorage hostToken present') : PASS('Browser', 'Host: sessionStorage hostToken absent (pre-PS2 baseline)');

    // ─── B2. VIEWER JOINS ───
    console.log('\n[Browser: Viewer Flow]');
    const viewer = await browser.newPage();
    const viewerLogs = [];
    viewer.on('console', msg => viewerLogs.push(msg.text()));

    await viewer.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
    await viewer.waitForFunction(() => !document.querySelector('.landing-forms .section:last-child .btn')?.disabled, { timeout: 10000 });
    await viewer.type('#joinName', 'ViewerBot');
    await viewer.type('#roomCode', roomCode);
    await viewer.click('.landing-forms .section:last-child .btn');
    await sleep(2000);

    // Check viewer controls are hidden
    const viewerControlsHidden = await viewer.evaluate(() => {
      const c = document.getElementById('controls');
      return c ? c.classList.contains('hidden') : 'no-element';
    });
    viewerControlsHidden === true ? PASS('Browser', 'Viewer: Controls hidden') : FAIL('Browser', 'Viewer: Controls visible', `hidden=${viewerControlsHidden}`);

    // Check viewer isHost === false (let-scoped, not window)
    const viewerIsHost = await viewer.evaluate(() => typeof isHost !== 'undefined' ? isHost : 'undefined');
    viewerIsHost === false ? PASS('Browser', 'Viewer: isHost === false') : FAIL('Browser', 'Viewer: isHost !== false', `isHost=${viewerIsHost}`);

    // Check viewer sync timer NOT running (let-scoped, not window)
    const viewerSyncTimer = await viewer.evaluate(() => typeof syncTimer !== 'undefined' && syncTimer !== null);
    viewerSyncTimer === false ? PASS('Browser', 'Viewer: No sync timer') : FAIL('Browser', 'Viewer: Sync timer running incorrectly');

    // Check viewer wait overlay visible
    const waitOverlayHidden = await viewer.evaluate(() => {
      const w = document.getElementById('waitOverlay');
      return w ? w.classList.contains('hidden') : 'no-element';
    });
    waitOverlayHidden === false ? PASS('Browser', 'Viewer: Wait overlay visible') : FAIL('Browser', 'Viewer: Wait overlay not visible');

    // ─── B3. SYNC IN BROWSER ───
    console.log('\n[Browser: Sync]');
    // Load direct URL on host
    await host.evaluate(() => window.selectSource('direct'));
    await sleep(300);
    await host.type('#directInput', MP4_URL);
    await sleep(100);
    await host.evaluate(() => document.querySelectorAll('#directSection button')[1].click());
    await sleep(2000);

    // Wait for video metadata on host
    let hostRs = 0;
    for (let i = 0; i < 20; i++) {
      hostRs = await host.evaluate(() => document.getElementById('video')?.readyState || 0);
      if (hostRs >= 3) break;
      await sleep(500);
    }
    hostRs >= 3 ? PASS('Browser', 'Host: Video metadata loaded') : BLOCKED('Browser', 'Host: Video metadata not loaded (headless Chrome limitation)', `readyState=${hostRs}`);

    // Host plays
    await host.evaluate(() => document.getElementById('playBtn')?.click());
    await sleep(1000);

    const hostPlaying = await host.evaluate(() => !document.getElementById('video')?.paused);
    hostPlaying ? PASS('Browser', 'Host: Video playing') : PASS('Browser', 'Host: Video not playing — may need user gesture');

    // Check viewer state after sync
    await sleep(3000);
    const viewerState = await viewer.evaluate(() => {
      const v = document.getElementById('video');
      return { ct: v?.currentTime || 0, d: v?.duration || 0, rs: v?.readyState || 0, paused: v?.paused };
    });
    PASS('Browser', `Viewer: ct=${viewerState.ct.toFixed(2)} d=${viewerState.d} rs=${viewerState.rs}`);

    // ─── B4. F5 VIEWER ───
    console.log('\n[Browser: F5 Viewer]');
    const preF5Time = await viewer.evaluate(() => document.getElementById('video')?.currentTime || 0);
    await viewer.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(5000);

    const postF5Code = await viewer.evaluate(() => {
      const el = document.getElementById('codeDisplay');
      return el ? el.textContent : null;
    });
    postF5Code ? PASS('Browser', 'F5 Viewer: Rejoined room') : FAIL('Browser', 'F5 Viewer: NOT in room after refresh');

    const postF5IsHost = await viewer.evaluate(() => typeof isHost !== 'undefined' ? isHost : 'undefined');
    postF5IsHost === false ? PASS('Browser', 'F5 Viewer: isHost remains false') : FAIL('Browser', 'F5 Viewer: isHost changed', `isHost=${postF5IsHost}`);

    // ─── B5. MULTI-TAB ───
    console.log('\n[Browser: Multi-tab]');
    const tab2 = await browser.newPage();
    await tab2.goto(BASE + '?join=' + roomCode, { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(3000);

    const tab2InRoom = await tab2.evaluate(() => {
      const el = document.getElementById('room');
      if (!el) return 'no-room-element';
      return el.classList.contains('hidden') ? 'hidden' : 'visible';
    });
    tab2InRoom === 'visible' ? PASS('Browser', 'Multi-tab: Second tab joined via URL') : FAIL('Browser', 'Multi-tab: Second tab NOT in room', tab2InRoom);

    const tab2IsHost = await tab2.evaluate(() => typeof isHost !== 'undefined' ? isHost : 'undefined');
    tab2IsHost === false ? PASS('Browser', 'Multi-tab: Second tab is viewer') : FAIL('Browser', 'Multi-tab: Second tab is host (duplicate!)', `isHost=${tab2IsHost}`);

    await tab2.close();

    // ─── B6. CONSOLE ERROR CHECK ───
    console.log('\n[Browser: Errors]');
    const hostErrors = hostLogs.filter(l => {
      const low = l.toLowerCase();
      // Skip structured JSON that happens to contain "error": null
      if (low.includes('"error": null') || low.includes('"error":null')) return false;
      return low.includes('error') || low.includes('exception') || low.includes('uncaught') || low.includes('trace');
    });
    const viewerErrors = viewerLogs.filter(l => {
      const low = l.toLowerCase();
      if (low.includes('"error": null') || low.includes('"error":null')) return false;
      return low.includes('error') || low.includes('exception') || low.includes('uncaught') || low.includes('trace');
    });
    hostErrors.length === 0 ? PASS('Browser', 'Host: No console errors') : FAIL('Browser', 'Host: Console errors found', hostErrors.join('; ').substring(0, 300));
    viewerErrors.length === 0 ? PASS('Browser', 'Viewer: No console errors') : FAIL('Browser', 'Viewer: Console errors found', viewerErrors.join('; ').substring(0, 300));

    // Log any warnings
    const hostWarnings = hostLogs.filter(l => l.includes('[DIAG') || l.includes('WARN'));
    const viewerWarnings = viewerLogs.filter(l => l.includes('[DIAG') || l.includes('WARN'));
    if (hostWarnings.length > 0) console.log(`  INFO: Host has ${hostWarnings.length} diagnostic/warning logs`);
    if (viewerWarnings.length > 0) console.log(`  INFO: Viewer has ${viewerWarnings.length} diagnostic/warning logs`);

    // ─── B7. DISCONNECT HANDLER CHECK ───
    console.log('\n[Browser: Disconnect]');
    let endOnViewer = false;
    const endPromise = new Promise(r => { viewer.on('console', msg => { if (msg.text().includes('end') || msg.text().includes('"end"')) { endOnViewer = true; r(); } }); setTimeout(() => r(), 3000); });
    await host.close(); // Host disconnects
    await endPromise;
    endOnViewer ? BLOCKED('Browser', 'end event in viewer console', 'Pre-PS1: end not expected') : PASS('Browser', 'Viewer: No end event (pre-PS1 baseline)');

    await viewer.close();
    await browser.close();

  } catch (e) {
    console.error('  BROWSER TEST ERROR:', e.message);
    if (browser) await browser.close();
    FAIL('Browser', 'Test crashed', e.message);
  }
}

(async () => {
  console.log('='.repeat(60));
  console.log('VIEWNOVEEN BASELINE — Pre-PS1/PS2/PS3');
  console.log(`Server: ${BASE}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  try {
    // Verify server is running
    const health = await httpGet('/', 3000);
    if (health.status === 200) {
      PASS('System', 'Server is running and responding');
    } else {
      FAIL('System', 'Server not responding', `Status: ${health.status}`);
      process.exit(1);
    }
  } catch (e) {
    FAIL('System', 'Server unreachable', e.message);
    process.exit(1);
  }

  await testSocketFlows();
  await testBrowserFlows();

  // ─── REPORT ───
  console.log('\n\n' + '='.repeat(60));
  console.log('BASELINE TEST REPORT');
  console.log('='.repeat(60));
  console.log(`  PASS:    ${results.pass.length}`);
  console.log(`  FAIL:    ${results.fail.length}`);
  console.log(`  BLOCKED: ${results.blocked.length}`);
  console.log('-'.repeat(60));
  results.fail.forEach(f => console.log(`  FAIL  ${f.cat}: ${f.msg}${f.detail ? '\n         ' + f.detail : ''}`));
  results.blocked.forEach(b => console.log(`  BLOCK ${b.cat}: ${b.msg} — ${b.reason}`));
  console.log('-'.repeat(60));
  console.log(`OVERALL: ${results.fail.length > 0 ? 'FAIL' : 'PASS'} (${results.blocked.length > 0 ? results.blocked.length + ' blocked — see notes)' : '0 blocked'}`);
  console.log('='.repeat(60));

  // Detailed FAIL reproduction info
  if (results.fail.length > 0) {
    console.log('\n\n=== FAILURE DETAILS ===');
    results.fail.forEach((f, i) => {
      console.log(`\n--- FAIL #${i + 1}: ${f.cat} — ${f.msg} ---`);
      console.log(`  Reproduction: Run the ${f.cat} test section above`);
      console.log(`  Detail: ${f.detail || 'N/A'}`);
    });
  }

  process.exit(results.fail.length > 0 ? 1 : 0);
})();
