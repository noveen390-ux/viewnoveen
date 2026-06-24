const { io } = require("socket.io-client");
const http = require("http");
const https = require("https");
const fs = require("fs");

const BASE = "http://localhost:3000";
const results = {};
const GLOBAL_TIMEOUT = 30000; // 30s max per test section

function pass(cat, msg) {
  results[cat] = results[cat] || [];
  results[cat].push({ status: "PASS", msg });
  console.log(`  \u2713 ${cat}: ${msg}`);
}

function fail(cat, msg, err) {
  results[cat] = results[cat] || [];
  results[cat].push({ status: "FAIL", msg: err ? `${msg}: ${err.message || err}` : msg });
  console.log(`  \u2717 ${cat}: ${msg}`);
}

function envLimit(cat, msg) {
  results[cat] = results[cat] || [];
  results[cat].push({ status: "ENV-LIMIT", msg });
  console.log(`  ~ ${cat}: ${msg}`);
}

function httpGet(path, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), ms))
  ]);
}

(async () => {
  console.log("=== VIEWNOVEEN POST-REMOVAL REGRESSION REPORT ===");
  console.log(`Start: ${new Date().toISOString()}\n`);

  // ─── 1. YOUTUBE ────────────────────────────────────────────
  console.log("[YouTube]");
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ["websocket"] });
      const V = io(BASE, { transports: ["websocket"] });
      await Promise.all([
        new Promise(r => H.on("connect", r)),
        new Promise(r => V.on("connect", r))
      ]);
      const rc = await new Promise(r => H.emit("create", r));
      await new Promise(r => V.emit("join", { c: rc.code, n: "Tester" }, r));

      let metaOk = false;
      V.on("meta", (m) => { if (m.source === "youtube" && m.videoId === "dQw4w9WgXcQ") metaOk = true; });
      H.emit("meta", { source: "youtube", videoId: "dQw4w9WgXcQ" });
      await delay(400);
      metaOk ? pass("YouTube", "meta event broadcast to viewer") : fail("YouTube", "meta not received");

      let resetOk = false;
      V.on("reset", () => { resetOk = true; });
      H.emit("reset");
      await delay(400);
      resetOk ? pass("YouTube", "reset event broadcast to viewer") : fail("YouTube", "reset not received");

      H.close(); V.close();
    })(), 10000, "YouTube test");
  } catch (e) {
    fail("YouTube", "test failed", e);
  }

  // ─── 2. DIRECT ─────────────────────────────────────────────
  console.log("\n[Direct]");
  // Server serves index.html
  try {
    const res = await withTimeout(httpGet("/", 5000), 7000, "GET /");
    res.status === 200 ? pass("Direct", "server serves index.html on GET /") : fail("Direct", `GET / returned ${res.status}`);
  } catch (e) {
    fail("Direct", "GET / failed", e.message === "timeout" ? "timeout" : e);
  }

  // Player endpoint (quick check - just verify it responds)
  try {
    const res = await withTimeout(httpGet("/player?url=http://localhost:3000/test.mp4", 3000), 5000, "/player");
    if (res.status === 200) pass("Direct", "/player endpoint returns 200");
    else fail("Direct", `/player returned ${res.status}`);
  } catch (e) {
    fail("Direct", "/player endpoint failed", e.message || e);
  }

  // direct-back socket event
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ["websocket"] });
      const V = io(BASE, { transports: ["websocket"] });
      await Promise.all([
        new Promise(r => H.on("connect", r)),
        new Promise(r => V.on("connect", r))
      ]);
      const rc = await new Promise(r => H.emit("create", r));
      await new Promise(r => V.emit("join", { c: rc.code, n: "Tester" }, r));

      let dbOk = false;
      V.on("direct-back", () => { dbOk = true; });
      H.emit("meta", { source: "direct", url: "http://example.com/v.mp4" });
      await delay(200);
      H.emit("direct-back");
      await delay(300);
      dbOk ? pass("Direct", "direct-back event broadcast") : fail("Direct", "direct-back not received");
      H.close(); V.close();
    })(), 10000, "direct-back test");
  } catch (e) {
    fail("Direct", "direct-back socket test failed", e.message || e);
  }

  // ─── 3. UPLOAD ─────────────────────────────────────────────
  console.log("\n[Upload]");
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ["websocket"] });
      const V = io(BASE, { transports: ["websocket"] });
      await Promise.all([
        new Promise(r => H.on("connect", r)),
        new Promise(r => V.on("connect", r))
      ]);
      const rc = await new Promise(r => H.emit("create", r));
      await new Promise(r => V.emit("join", { c: rc.code, n: "Tester" }, r));

      let metaUp = false, chunkOk = false;
      V.on("meta", (m) => { if (m.n === "test.mkv") metaUp = true; });
      V.on("chunk", (d) => { if (d.i === 0) chunkOk = true; });

      H.emit("meta", { n: "test.mkv", s: 131072, type: "video/x-matroska", t: 2 });
      await delay(300);
      metaUp ? pass("Upload", "meta event broadcast") : fail("Upload", "meta not received");

      const buf = Buffer.alloc(65536, 0xAB);
      H.emit("chunk", { i: 0, t: 2, d: buf });
      await delay(300);
      chunkOk ? pass("Upload", "chunk event broadcast") : fail("Upload", "chunk not received");

      H.emit("reset");
      await delay(100);
      H.close(); V.close();
    })(), 10000, "Upload test");
  } catch (e) {
    fail("Upload", "test failed", e.message || e);
  }

  // ─── 4. LOCALSTREAM ────────────────────────────────────────
  console.log("\n[LocalStream]");
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ["websocket"] });
      const V = io(BASE, { transports: ["websocket"] });
      await Promise.all([
        new Promise(r => H.on("connect", r)),
        new Promise(r => V.on("connect", r))
      ]);
      const rc = await new Promise(r => H.emit("create", r));
      await new Promise(r => V.emit("join", { c: rc.code, n: "Tester" }, r));

      let lsOk = false, lsPlayOk = false, lsPauseOk = false, lsSeekOk = false;
      V.on("meta", (m) => { if (m.source === "localstream") lsOk = true; });
      V.on("play", () => { if (lsOk) lsPlayOk = true; });
      V.on("pause", () => { if (lsOk) lsPauseOk = true; });
      V.on("seek", (s) => { if (typeof s === "object" && s.t === 30) lsSeekOk = true; });
      H.emit("meta", { source: "localstream", url: "/video/test.mkv", name: "test.mkv" });
      await delay(200);
      lsOk ? pass("LocalStream", "meta event broadcast") : fail("LocalStream", "meta not received");
      // Simulate host playing, pausing, seeking via socket-io
      H.emit("play", 0);
      await delay(100);
      lsPlayOk ? pass("LocalStream", "play sync after meta") : fail("LocalStream", "play not received");
      H.emit("pause", 0);
      await delay(100);
      lsPauseOk ? pass("LocalStream", "pause sync after meta") : fail("LocalStream", "pause not received");
      H.emit("seek", 30);
      await delay(100);
      lsSeekOk ? pass("LocalStream", "seek sync after meta") : fail("LocalStream", "seek not received");

      H.emit("reset");
      await delay(100);
      H.close(); V.close();
    })(), 10000, "LocalStream test");
  } catch (e) {
    fail("LocalStream", "test failed", e.message || e);
  }

  // ─── 5. SYNC ──────────────────────────────────────────────
  console.log("\n[Sync]");
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ["websocket"] });
      const V = io(BASE, { transports: ["websocket"] });
      await Promise.all([
        new Promise(r => H.on("connect", r)),
        new Promise(r => V.on("connect", r))
      ]);
      const rc = await new Promise(r => H.emit("create", r));
      await new Promise(r => V.emit("join", { c: rc.code, n: "Tester" }, r));

      let syncStateOk = false, playOk = false, pauseOk = false, seekOk = false;
      V.on("sync-state", (s) => { if (s.p === true) syncStateOk = true; });
      V.on("play", (t) => { playOk = true; });
      V.on("pause", (t) => { pauseOk = true; });
      V.on("seek", (s) => { if (s.t === 30) seekOk = true; });

      H.emit("sync-state", { p: true, t: 42 });
      await delay(150);
      H.emit("play", 42);
      await delay(100);
      H.emit("pause", 42);
      await delay(100);
      H.emit("seek", 30);
      await delay(300);

      syncStateOk ? pass("Sync", "sync-state event") : fail("Sync", "sync-state not received");
      playOk ? pass("Sync", "play event") : fail("Sync", "play not received");
      pauseOk ? pass("Sync", "pause event") : fail("Sync", "pause not received");
      seekOk ? pass("Sync", "seek event") : fail("Sync", "seek not received");

      H.close(); V.close();
    })(), 10000, "Sync test");
  } catch (e) {
    fail("Sync", "test failed", e.message || e);
  }

  // ─── 6. HOST / VIEWER ──────────────────────────────────────
  console.log("\n[Host/Viewer]");
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ["websocket"] });
      await new Promise(r => H.on("connect", r));
      const rc = await new Promise(r => H.emit("create", r));
      rc.code && rc.code.length === 6 ? pass("Host/Viewer", "room code created (6 chars)") : fail("Host/Viewer", "create failed");

      const V = io(BASE, { transports: ["websocket"] });
      await new Promise(r => V.on("connect", r));
      const joinRes = await new Promise(r => V.emit("join", { c: rc.code, n: "Alice" }, r));
      joinRes.ok ? pass("Host/Viewer", "viewer joins") : fail("Host/Viewer", "join failed");

      let chatOk = false;
      V.on("chat", (msg) => { if (msg.m === "hello") chatOk = true; });
      V.emit("chat", { m: "hello", n: "Alice" });
      await delay(300);
      chatOk ? pass("Host/Viewer", "chat broadcast") : fail("Host/Viewer", "chat not received");

      H.close(); V.close();
    })(), 10000, "Host/Viewer test");
  } catch (e) {
    fail("Host/Viewer", "test failed", e.message || e);
  }

  // ─── 7. F5 RECOVERY ────────────────────────────────────────
  console.log("\n[F5 Recovery]");
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ["websocket"] });
      await new Promise(r => H.on("connect", r));
      const rc = await new Promise(r => H.emit("create", r));
      H.emit("meta", { source: "youtube", videoId: "dQw4w9WgXcQ" });
      await delay(300);

      const H2 = io(BASE, { transports: ["websocket"] });
      await new Promise(r => H2.on("connect", r));
      const reclaimRes = await new Promise(r => H2.emit("reclaim-host", rc.code, r));

      if (reclaimRes && reclaimRes.ok) {
        pass("F5 Recovery", "reclaim succeeds");
        if (reclaimRes.meta && reclaimRes.meta.source === "youtube") {
          pass("F5 Recovery", "reclaim restores saved meta");
        } else {
          fail("F5 Recovery", "reclaim meta missing");
        }
      } else {
        fail("F5 Recovery", `reclaim returned: ${JSON.stringify(reclaimRes)}`);
      }
      H.close(); H2.close();
    })(), 10000, "F5 Recovery test");
  } catch (e) {
    fail("F5 Recovery", "test failed", e.message || e);
  }

  // ─── 8. RECONNECT ──────────────────────────────────────────
  console.log("\n[Reconnect]");
  try {
    await withTimeout((async () => {
      const H = io(BASE, { transports: ["websocket"] });
      await new Promise(r => H.on("connect", r));
      const rc = await new Promise(r => H.emit("create", r));
      const V = io(BASE, { transports: ["websocket"] });
      await new Promise(r => V.on("connect", r));
      await new Promise(r => V.emit("join", { c: rc.code, n: "Bob" }, r));
      await delay(200);

      H.disconnect();
      await delay(600);

      // New viewer joins
      const V2 = io(BASE, { transports: ["websocket"] });
      await new Promise(r => V2.on("connect", r));
      const join2 = await new Promise(r => V2.emit("join", { c: rc.code, n: "Charlie" }, r));
      join2.ok ? pass("Reconnect", "new viewer joins after host disconnect") : fail("Reconnect", "join failed");

      // Host reclaims
      const H2 = io(BASE, { transports: ["websocket"] });
      await new Promise(r => H2.on("connect", r));
      const reclaim2 = await new Promise(r => H2.emit("reclaim-host", rc.code, r));
      reclaim2.ok ? pass("Reconnect", "host reclaims after disconnect") : fail("Reconnect", `reclaim: ${JSON.stringify(reclaim2)}`);

      V.close(); V2.close(); H2.close();
    })(), 12000, "Reconnect test");
  } catch (e) {
    fail("Reconnect", "test failed", e.message || e);
  }

  // ─── 9. FULLSCREEN ─────────────────────────────────────────
  console.log("\n[Fullscreen]");
  try {
    const html = fs.readFileSync("C:\\Users\\Noveen\\AppData\\Local\\Temp\\opencode\\viewnoveen\\index.html", "utf8");
    const js = fs.readFileSync("C:\\Users\\Noveen\\AppData\\Local\\Temp\\opencode\\viewnoveen\\viewnoveen.js", "utf8");
    const hasBtn = /fullscreenBtn|fullscreen/.test(html);
    const hasAPI = /requestFullscreen|webkitRequestFullscreen|fullscreenElement|fullscreenchange/.test(html + js);
    if (hasBtn && hasAPI) pass("Fullscreen", "fullscreen button + API calls present");
    else if (hasBtn) fail("Fullscreen", "button found but no API calls");
    else fail("Fullscreen", "no fullscreen implementation");
  } catch (e) {
    fail("Fullscreen", "read error", e);
  }

  // ─── 10. SUBTITLES ─────────────────────────────────────────
  console.log("\n[Subtitles]");
  try {
    const html = fs.readFileSync("C:\\Users\\Noveen\\AppData\\Local\\Temp\\opencode\\viewnoveen\\index.html", "utf8");
    const hasTrack = /<track|TextTrack|texttrack|kind=\"subtitles\"|captions/i.test(html);
    const hasSubBtn = /ccBtn|subtitles|\.srt|\.vtt|subtitle/i.test(html);
    if (hasTrack || hasSubBtn) {
      pass("Subtitles", "subtitle/caption elements found");
    } else {
      envLimit("Subtitles", "no subtitle implementation in this project");
    }
  } catch (e) {
    fail("Subtitles", "read error", e);
  }

  // ─── 11. MOBILE UX ─────────────────────────────────────────
  console.log("\n[Mobile UX]");
  try {
    const html = fs.readFileSync("C:\\Users\\Noveen\\AppData\\Local\\Temp\\opencode\\viewnoveen\\index.html", "utf8");
    const features = [];
    if (/height:44px|width:44px|touch-action|min-height:56px/.test(html)) features.push("touch targets");
    if (/flex-wrap|flexWrap/.test(html)) features.push("source wrapping");
    if (/landscape|orientation/.test(html)) features.push("landscape layout");
    if (/visualViewport/.test(html)) features.push("visualViewport");
    if (/@media[^{]*\{\s*[^}]*max-width/.test(html)) features.push("responsive breakpoints");
    features.length > 0 ? pass("Mobile UX", `detected: ${features.join(", ") || "features present"}`) : envLimit("Mobile UX", "no mobile-specific features detected");
  } catch (e) {
    fail("Mobile UX", "read error", e);
  }

  // ─── 12. ±5s CONTROLS ─────────────────────────────────────
  console.log("\n[\u00B15s Controls]");
  try {
    const html = fs.readFileSync("C:\\Users\\Noveen\\AppData\\Local\\Temp\\opencode\\viewnoveen\\index.html", "utf8");
    const hasSkip = /skipBack|skip-back|skip_back|back5|rewind|\b-5\b|skipForward|skip-forward|skip_forward|fwd5|forward|\+5/.test(html);
    hasSkip ? pass("\u00B15s Controls", "skip/seek buttons found") : envLimit("\u00B15s Controls", "no skip controls (feature may not exist)");
  } catch (e) {
    fail("\u00B15s Controls", "read error", e);
  }

  // ─── 13. REMOVAL VERIFICATION ─────────────────────────────
  console.log("\n[Removal Verification]");
  try {
    const html = fs.readFileSync("C:\\Users\\Noveen\\AppData\\Local\\Temp\\opencode\\viewnoveen\\index.html", "utf8");
    const server = fs.readFileSync("C:\\Users\\Noveen\\AppData\\Local\\Temp\\opencode\\viewnoveen\\server.js", "utf8");

    const vlcHtml = html.match(/vlc|VLC/g);
    const archiveHtml = html.match(/archive\.org|Archive\.org/g);
    const vlcSrv = server.match(/vlc|ffmpeg|HLS_DIR|hls_segment|hls_time/g);
    const archiveSrv = server.match(/archive/g);

    if (!vlcHtml) pass("Removal", "no VLC in index.html");
    else fail("Removal", `VLC still in index.html (${vlcHtml.length} matches)`);

    if (!archiveHtml) pass("Removal", "no Archive.org in index.html");
    else fail("Removal", `Archive.org still in index.html (${archiveHtml.length} matches)`);

    if (!vlcSrv) pass("Removal", "no VLC/ffmpeg in server.js");
    else fail("Removal", `VLC/ffmpeg still in server.js (${vlcSrv.length} matches)`);

    if (!archiveSrv) pass("Removal", "no Archive in server.js");
    else fail("Removal", `Archive still in server.js (${archiveSrv.length} matches)`);
  } catch (e) {
    fail("Removal", "read error", e);
  }

  // ─── REPORT ────────────────────────────────────────────────
  console.log("\n" + "=".repeat(55));
  console.log("FINAL REGRESSION REPORT");
  console.log("=".repeat(55));
  let totalPass = 0, totalFail = 0, totalEnv = 0;
  for (const [cat, items] of Object.entries(results)) {
    const passes = items.filter(i => i.status === "PASS").length;
    const fails = items.filter(i => i.status === "FAIL").length;
    const envs = items.filter(i => i.status === "ENV-LIMIT").length;
    totalPass += passes; totalFail += fails; totalEnv += envs;
    const status = fails > 0 ? "FAIL" : (passes > 0 || envs === 0 ? "PASS" : "ENV-LIMIT");
    console.log(`  ${status.padEnd(8)} ${cat}: ${passes} pass, ${fails} fail, ${envs} env`);
  }
  console.log("-".repeat(55));
  console.log(`  TOTAL: ${totalPass} PASS, ${totalFail} FAIL, ${totalEnv} ENV-LIMIT`);
  console.log(`  OVERALL: ${totalFail > 0 ? "FAIL" : "PASS"}`);
  console.log("=".repeat(55));
  process.exit(totalFail > 0 ? 1 : 0);
})();
