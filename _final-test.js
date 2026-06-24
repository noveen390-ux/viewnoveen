const puppeteer = require('puppeteer');
const BASE = 'http://localhost:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('  OK ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? ' (' + detail + ')' : '')); }
}

(async () => {
  console.log('=== 1. HOST CREATES ROOM + LOADS VIDEO ===');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const host = await browser.newPage();
  host.on('pageerror', e => console.log('HE:', e.message));
  
  await host.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(600);
  await host.evaluate(() => document.getElementById('hostName').value = 'Ali');
  await host.click('#createBtn');
  await sleep(2000);
  let code = await host.evaluate(() => document.getElementById('codeDisplay').textContent.trim());
  check('Room created', code && code.length >= 4, code);
  
  await host.evaluate((url) => window.startDirect(url), BASE + '/test-video.mp4');
  await sleep(4000);
  let hv = await host.evaluate(() => {
    const v = document.getElementById('video');
    return { rs: v.readyState, d: v.duration };
  });
  check('Video loaded', hv.rs >= 3 && hv.d > 0, 'dur=' + hv.d);
  
  // 2
  console.log('');
  console.log('=== 2. VIEWER JOINS - DRIFT ===');
  const viewer = await browser.newPage();
  viewer.on('pageerror', e => console.log('VE:', e.message));
  await viewer.goto(BASE + '?join=' + code + '&name=Sara', { waitUntil: 'domcontentloaded' });
  await sleep(5000);
  let vv = await viewer.evaluate(() => {
    const v = document.getElementById('video');
    return { ct: v.currentTime, p: v.paused, inRoom: !document.getElementById('room').classList.contains('hidden') };
  });
  check('Viewer in room', vv.inRoom);
  check('Viewer NOT drifted', vv.ct < 1, 'ct=' + vv.ct);
  check('Viewer paused', vv.p === true);
  
  // 3
  console.log('');
  console.log('=== 3. PLAY SYNC ===');
  await host.evaluate(() => document.getElementById('playBtn').click());
  await sleep(3000);
  hv = await host.evaluate(() => {
    const v = document.getElementById('video');
    return { ct: v.currentTime, p: v.paused };
  });
  vv = await viewer.evaluate(() => {
    const v = document.getElementById('video');
    return { ct: v.currentTime, p: v.paused };
  });
  check('Host playing', !hv.p);
  check('Viewer playing', !vv.p);
  check('Drift < 5s', Math.abs(hv.ct - vv.ct) < 5, 'h=' + hv.ct.toFixed(2) + ' v=' + vv.ct.toFixed(2));
  
  // 4
  console.log('');
  console.log('=== 4. PAUSE SYNC ===');
  await host.evaluate(() => document.getElementById('playBtn').click());
  await sleep(2000);
  vv = await viewer.evaluate(() => {
    const v = document.getElementById('video');
    return { ct: v.currentTime, p: v.paused };
  });
  check('Viewer paused', vv.p === true);
  
  // 5
  console.log('');
  console.log('=== 5. RESUME SYNC ===');
  await host.evaluate(() => document.getElementById('playBtn').click());
  await sleep(3000);
  vv = await viewer.evaluate(() => {
    const v = document.getElementById('video');
    return { ct: v.currentTime, p: v.paused };
  });
  check('Viewer resumed', !vv.p);
  
  // 6
  console.log('');
  console.log('=== 6. SEEK SYNC ===');
  await host.evaluate(() => {
    const sb = document.getElementById('seekbar');
    sb.value = 500;
    sb.dispatchEvent(new Event('input'));
  });
  await sleep(2500);
  hv = await host.evaluate(() => {
    const v = document.getElementById('video');
    return { ct: v.currentTime };
  });
  vv = await viewer.evaluate(() => {
    const v = document.getElementById('video');
    return { ct: v.currentTime, p: v.paused };
  });
  check('Viewer playing after seek', !vv.p);
  check('Drift < 5s after seek', Math.abs(hv.ct - vv.ct) < 5, 'h=' + hv.ct.toFixed(2) + ' v=' + vv.ct.toFixed(2));
  
  // 7
  console.log('');
  console.log('=== 7. MULTI PLAY/PAUSE ===');
  // Pause host and seek to safe position before multi-play/pause cycles
  await host.evaluate(() => {
    const v = document.getElementById('video');
    v.pause();
    if (v.ended || v.currentTime > 7) {
      v.currentTime = 1;
    }
  });
  await sleep(300);
  for (let i = 0; i < 3; i++) {
    await host.evaluate(() => document.getElementById('playBtn').click());
    await sleep(2000);
    await host.evaluate(() => document.getElementById('playBtn').click());
    await sleep(2000);
    vv = await viewer.evaluate(() => {
      const v = document.getElementById('video');
      return { p: v.paused };
    });
    hvState = await host.evaluate(() => {
      const v = document.getElementById('video');
      return { p: v.paused, ct: v.currentTime };
    });
    diagMsg = 'h.p=' + hvState.p + ' h.ct=' + hvState.ct.toFixed(1) + ' v.p=' + vv.p + ' v.ct=' + (vv.ct||0).toFixed(1);
    check('Cycle ' + (i+1) + ': viewer paused', vv.p === true, diagMsg);
  }
  
  // 8
  console.log('');
  console.log('=== 8. VOLUME ===');
  await host.evaluate(() => document.getElementById('controls').classList.add('show'));
  await sleep(500);
  await host.evaluate(() => document.getElementById('muteBtn').click());
  await sleep(100);
  let muted = await host.evaluate(() => document.getElementById('video').muted);
  check('Mute toggle', muted === true);
  await host.evaluate(() => {
    const vs = document.getElementById('volumeSlider');
    vs.value = '0.5';
    vs.dispatchEvent(new Event('input'));
  });
  await sleep(200);
  let vol = await host.evaluate(() => document.getElementById('video').volume);
  check('Volume slider', Math.abs(vol - 0.5) < 0.01, 'vol=' + vol);
  
  // 9
  console.log('');
  console.log('=== 9. F5 RECOVERY ===');
  await host.goto(BASE + '?join=' + code, { waitUntil: 'domcontentloaded' });
  await sleep(5000);
  let rec = await host.evaluate(() => {
    const r = document.getElementById('room');
    const v = document.getElementById('video');
    return {
      inRoom: r && !r.classList.contains('hidden'),
      hasVideo: v && v.readyState >= 1,
      ct: v ? v.currentTime : -1
    };
  });
  check('Host recovered', rec.inRoom);
  check('Video loaded', rec.hasVideo);
  check('Time > 0', rec.ct > 0, 'ct=' + rec.ct.toFixed(2));
  
  await sleep(2000);
  let vInRoom = await viewer.evaluate(() => {
    const r = document.getElementById('room');
    return r && !r.classList.contains('hidden');
  });
  check('Viewer still in room', vInRoom);
  
  // set up viewer event tracing
  viewer.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'error') {
      const txt = msg.text();
      if (txt.includes('VIEWER_EVENT') || txt.includes('VIEWER_PAUSE')) console.log('  [VIEWER] ' + txt);
    }
  });
  // trace events on BOTH pages
  for (const p of [host, viewer]) {
    p.on('console', msg => {
      const txt = msg.text();
      if (txt.includes('PAUSE_SRC') || txt.includes('HOST_EMIT') || txt.includes('HOST_EVENT') || txt.includes('HOST_PAUSE_CALLED') || txt.includes('VIEWER_EVENT') || txt.includes('VIEWER_PAUSE') || txt.includes('socket not found')) {
        console.log('  [' + (p === host ? 'HOST' : 'VIEWER') + '] ' + txt);
      }
    });
  }
  await viewer.evaluate(() => {
    if (window.__viewerPatched) return;
    window.__viewerPatched = true;
    window.__viewerEvents = [];
    const sockV = window.__socket;
    if (!sockV) { console.log('VIEWER_EVENT socket not found'); return; }
    const origOnV = sockV.on;
    sockV.on = function(ev, fn) {
      return origOnV.call(sockV, ev, function(...args) {
        window.__viewerEvents.push({ ev, at: performance.now(), args: JSON.parse(JSON.stringify(args)) });
        console.log('VIEWER_EVENT', ev, JSON.stringify(args[0]));
        return fn.apply(this, args);
      });
    };
    const v = document.getElementById('video');
    if (v && !v._origPause) {
      v._origPause = v.pause;
      v.pause = function() {
        console.log('VIEWER_PAUSE called at ct=' + v.currentTime + ' paused=' + v.paused + ' ended=' + v.ended + ' stack=' + new Error().stack.split('\n').slice(1,4).join(' > '));
        return v._origPause.apply(v, arguments);
      };
    }
  });
  try {
    await host.evaluate(() => {
      if (window.__hostPatched) return;
      window.__hostPatched = true;
      window.__hostEvents = [];
      const sockH = window.__socket;
      if (!sockH) { console.log('HOST_EMIT socket not found'); return; }
      const origEmitH = sockH.emit;
      sockH.emit = function(ev, ...args) {
        console.log('HOST_EMIT', ev, JSON.stringify(args && args.length ? args[0] : null));
        return origEmitH.apply(sockH, [ev, ...args]);
      };
      const v = document.getElementById('video');
      if (v && !v._origPauseHost) {
        v._origPauseHost = v.pause;
        console.log('HOST_EMIT wrapper-installed paused=' + v.paused + ' typeof orig=' + typeof v._origPauseHost);
        v.pause = function() {
          console.log('HOST_PAUSE_CALLED ct=' + v.currentTime + ' paused=' + v.paused + ' ended=' + v.ended + ' stack=' + new Error().stack.split('\n').slice(1,5).join('>'));
          return v._origPauseHost.apply(v, arguments);
        };
      } else {
        console.log('HOST_EMIT wrapper-skip found=' + !!v + ' orig=' + (v ? v._origPauseHost : 'n/a'));
      }
      const videoEvents = ['loadstart','progress','suspend','abort','error','emptied','stalled','loadedmetadata','loadeddata','canplay','canplaythrough','playing','waiting','seeking','seeked','ended','ratechange','durationchange','volumechange'];
      videoEvents.forEach(evt => {
        v.addEventListener(evt, () => {
          console.log('HOST_EVENT ' + evt + ' ct=' + v.currentTime + ' p=' + v.paused);
        });
      });
    });
  } catch(e) {
    console.log('  [HOST PATCH ERROR]', e.message);
  }

  // 10
  console.log('');
  console.log('=== 10. FINAL PLAY ===');
  await sleep(1000);
  let hostVs = await host.evaluate(() => {
    const v = document.getElementById('video');
    v.currentTime = 1;
    return { ct: v.currentTime, p: v.paused, ended: v.ended, rs: v.readyState };
  });
  console.log('  host before play:', JSON.stringify(hostVs));
  let viewVs = await viewer.evaluate(() => {
    const v = document.getElementById('video');
    return { ct: v.currentTime, p: v.paused, ended: v.ended, rs: v.readyState };
  });
  console.log('  viewer before play:', JSON.stringify(viewVs));
  
  await host.evaluate(() => document.getElementById('playBtn').click());
  await sleep(1000);
  let v1 = await viewer.evaluate(() => { const v = document.getElementById('video'); return { ct: v.currentTime, p: v.paused }; });
  console.log('  viewer 1s after play:', JSON.stringify(v1));
  await sleep(1000);
  let v2 = await viewer.evaluate(() => { const v = document.getElementById('video'); return { ct: v.currentTime, p: v.paused }; });
  console.log('  viewer 2s after play:', JSON.stringify(v2));
  await sleep(1000);
  vv = await viewer.evaluate(() => { const v = document.getElementById('video'); return { ct: v.currentTime, p: v.paused }; });
  console.log('  viewer 3s after play:', JSON.stringify(vv));
  check('Viewer plays after F5', !vv.p);
  
  // Results
  console.log('');
  console.log('==============================');
  console.log('  PASSED: ' + pass);
  console.log('  FAILED: ' + fail);
  console.log('  TOTAL:  ' + (pass + fail));
  console.log('  RESULT: ' + (fail === 0 ? 'ALL PASSED' : fail + ' FAILURES'));
  console.log('==============================');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
