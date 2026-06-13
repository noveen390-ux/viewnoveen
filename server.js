const express = require("express");
const http = require("http");
const https = require("https");
const { createServer } = http;
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1024 * 1024 * 1024,
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 10000,
  transports: ["websocket", "polling"],
  allowUpgrades: true,
});

const PORT = process.env.PORT || process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const ROOMS_FILE = path.join(DATA_DIR, "rooms.json");
let rooms = {};
const ffmpegProcesses = {};
const HLS_DIR = path.join(__dirname, "hls");
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });
app.use("/hls", express.static(HLS_DIR));

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadRooms() {
  ensureDataDir();
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const raw = fs.readFileSync(ROOMS_FILE, "utf8");
      const data = JSON.parse(raw);
      const now = Date.now();
      const STALE_MS = 2 * 60 * 60 * 1000;
      let pruned = false;
      for (const code of Object.keys(data)) {
        const r = data[code];
        // Skip stale rooms (no host abandoned over an hour ago)
        if (r._abandonedAt && now - r._abandonedAt > STALE_MS) {
          deleteChunksFile(code);
          delete data[code];
          pruned = true;
          continue;
        }
        const chunkFile = path.join(DATA_DIR, `${code}.chunks`);
        if (r.total > 0 && fs.existsSync(chunkFile)) {
          const buf = fs.readFileSync(chunkFile);
          r.chunks = new Array(r.total);
          let offset = 0;
          while (offset < buf.length) {
            const idx = buf.readUInt32BE(offset);
            const sz = buf.readUInt32BE(offset + 4);
            offset += 8;
            if (sz > 0) r.chunks[idx] = buf.slice(offset, offset + sz);
            offset += sz;
          }
        } else {
          r.chunks = [];
        }
        r.users = {};
        r.host = null;
      }
      if (pruned) doSave();
      return data;
    }
  } catch (e) {
    console.error("Failed to load rooms:", e.message);
  }
  return {};
}

function deleteChunksFile(code) {
  try {
    const f = path.join(DATA_DIR, `${code}.chunks`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch (e) {}
}

let saveTimeout = null;
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(doSave, 500);
}

function doSave() {
  saveTimeout = null;
  ensureDataDir();
  try {
    const out = {};
    for (const code of Object.keys(rooms)) {
      const r = rooms[code];
      out[code] = {
        meta: r.meta,
        total: r.total,
        state: r.state,
        _abandonedAt: r._abandonedAt || null,
      };
      if (r.total > 0) {
        const chunkFile = path.join(DATA_DIR, `${code}.chunks`);
        const fd = fs.openSync(chunkFile, "w");
        for (let i = 0; i < r.total; i++) {
          const c = r.chunks[i];
          if (c) {
            const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
            const header = Buffer.alloc(8);
            header.writeUInt32BE(i, 0);
            header.writeUInt32BE(buf.length, 4);
            fs.writeSync(fd, header);
            fs.writeSync(fd, buf);
          }
        }
        fs.closeSync(fd);
      } else {
        deleteChunksFile(code);
      }
    }
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(out, null, 2));
  } catch (e) {
    console.error("Failed to save rooms:", e.message);
  }
}

// Clean up stale rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  const STALE_MS = 2 * 60 * 60 * 1000;
  let changed = false;
  for (const code of Object.keys(rooms)) {
    const room = rooms[code];
    if (!room.host && Object.keys(room.users).length === 0 && room._abandonedAt && now - room._abandonedAt > STALE_MS) {
      deleteChunksFile(code);
      delete rooms[code];
      changed = true;
      console.log(`Cleaned up stale room ${code}`);
    }
  }
  if (changed) doSave();
}, 10 * 60 * 1000);

// Persist room state to disk every 30 seconds
setInterval(() => doSave(), 30 * 1000);

rooms = loadRooms();

// Minimal player page for iframe-based direct URL playback
// The <video> tag uses /proxy to stream the content same-origin (avoids CORS and 404s)
app.get("/player", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("Missing url parameter");
  const enc = encodeURIComponent(url);
  const page = `<!DOCTYPE html><html><body style="margin:0;background:#000">
<video src="/proxy?url=${enc}" controls autoplay style="width:100%;height:100vh"
  oncanplay="parent.postMessage('vnsync-video-ready','*')"
  onerror="parent.postMessage('vnsync-video-ready','*')"></video>
</body></html>`;
  res.send(page);
});

app.use(express.static(__dirname));

// Proxy endpoint for Stremio extract URLs that don't work directly in the browser
//   /proxy?url=...           → streams the video content (single GET with auto redirect)
//   /proxy?check=1&url=...   → returns JSON metadata (HEAD-based, no body download)
app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end("Missing url");
  // Suppress write-after-destroy errors (client disconnect = expected, not a crash)
  res.on("error", () => {});
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    const referer = origin + "/";
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": referer,
      "Origin": origin,
    };

    // === CHECK MODE: HEAD + manual redirects, returns JSON ===
    if (req.query.check === "1") {
      let current = url;
      let lastRes = null;
      for (let i = 0; i < 20; i++) {
        const r = await fetch(current, { method: "HEAD", redirect: "manual", headers });
        const loc = [301, 302, 303, 307, 308].includes(r.status) ? r.headers.get("location") : null;
        if (loc) { current = new URL(loc, current).href; continue; }
        lastRes = r;
        break;
      }
      if (!lastRes) return res.json({ error: "Redirect chain broken" });
      const ct = lastRes.headers.get("content-type") || "";
      const isHls = ct.includes("mpegurl") || ct.includes("mpegURL") || current.toLowerCase().includes(".m3u8");
      console.log(`[proxy/check] final: ${current}  status: ${lastRes.status}  type: ${ct}  hls: ${isHls}`);
      return res.json({ url: current, status: lastRes.status, contentType: ct, isHls });
    }

    // === STREAM MODE: single GET with auto redirect, streams the body ===
    if (req.headers.range) headers["Range"] = req.headers.range;
    const upstream = await fetch(url, { redirect: "follow", headers });
    console.log(`[proxy/stream] req: ${url}  final: ${upstream.url}  status: ${upstream.status}  type: ${upstream.headers.get("content-type") || ""}`);
    ["content-type", "content-length", "content-range", "accept-ranges"].forEach(h => {
      if (upstream.headers.get(h)) res.setHeader(h, upstream.headers.get(h));
    });
    res.status(upstream.status);
    if (upstream.body) {
      for await (const chunk of upstream.body) {
        if (res.destroyed) break;
        res.write(chunk);
      }
    }
    if (!res.destroyed) res.end();
  } catch (e) {
    console.error(`[proxy] error: ${e.message}`);
    if (!res.destroyed) res.status(502).end("Proxy error");
  }
});

io.on("connection", (socket) => {
  socket.on("create", (cb) => {
    let code;
    do {
      code = crypto.randomBytes(3).toString("hex").toUpperCase();
    } while (rooms[code]);

    rooms[code] = {
      host: socket.id,
      meta: null,
      chunks: [],
      total: 0,
      state: { p: false, t: 0 },
      users: {},
    };

    socket.data.room = code;
    socket.join(code);
    rooms[code].users[socket.id] = { n: "Host" };
    io.to(code).emit("count", Object.keys(rooms[code].users).length);
    scheduleSave();
    cb({ code });
  });

  socket.on("join", ({ c, n }, cb) => {
    const code = c.toUpperCase();
    const room = rooms[code];
    if (!room) return cb({ err: "Room not found." });

    socket.data.room = code;
    socket.join(code);
    room.users[socket.id] = { n: n || "Anonymous" };
    io.to(code).emit("count", Object.keys(room.users).length);

    if (room.meta) {
      socket.emit("meta", room.meta);
      for (let i = 0; i < room.total; i++) {
        if (room.chunks[i]) {
          socket.emit("chunk", { i, t: room.total, d: room.chunks[i] });
        }
      }
      if (room.proxyChunks && room.proxyChunks.length > 0) {
        for (const c of room.proxyChunks) {
          socket.emit("proxy-chunk", { d: c, last: false });
        }
        if (!room.proxyFetching) {
          socket.emit("proxy-end");
        }
      }
    }

    socket.emit("state", room.state);
    cb({ ok: true });
  });

  socket.on("meta", (m) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.meta = m;
      if (m.source === "youtube" || m.source === "drive" || m.source === "vk" || m.source === "archive" || m.source === "direct" || m.source === "torrent" || m.source === "proxy") {
        room.total = 0;
        room.chunks = [];
      } else {
        room.total = m.t || 0;
        room.chunks = new Array(room.total);
      }
      socket.to(socket.data.room).emit("meta", m);
      scheduleSave();
    }
  });

  socket.on("chunk", (d) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id && d.i < room.total) {
      room.chunks[d.i] = d.d;
      socket.to(socket.data.room).emit("chunk", d);
      scheduleSave();
    }
  });

  socket.on("play", (t) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.state = { p: true, t };
      socket.to(socket.data.room).emit("play", t);
      scheduleSave();
    }
  });

  socket.on("pause", (t) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.state = { p: false, t };
      socket.to(socket.data.room).emit("pause", t);
      scheduleSave();
    }
  });

  socket.on("seek", (t) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.state = { ...room.state, t };
      socket.to(socket.data.room).emit("seek", t);
      scheduleSave();
    }
  });

  socket.on("proxy-resolve", async (url, opts, cb) => {
    if (!url) return cb({ error: "Missing url" });
    if (typeof opts === "function") { cb = opts; opts = {}; }
    try {
      const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
      if (opts.referer) headers["Referer"] = opts.referer;
      else try { headers["Referer"] = new URL(url).origin + "/"; } catch (e) {}
      try { headers["Origin"] = new URL(url).origin; } catch (e) {}
      if (opts.customHeaders) Object.assign(headers, opts.customHeaders);

      // Use GET with Range:0-0 for reliable header detection (more robust than HEAD)
      let useRange = true;
      let response = await fetch(url, { redirect: "follow", headers: { ...headers, Range: "bytes=0-0" } });
      if (response.status === 200) {
        // Server ignored Range; retry without it for proper status/headers
        response = await fetch(url, { redirect: "follow", headers });
        useRange = false;
      }

      const ct = response.headers.get("content-type") || "";
      const cl = response.headers.get("content-length");
      const clTotal = useRange ? response.headers.get("content-range") : null;
      const contentLength = clTotal ? parseInt(clTotal.split("/")[1]) : (cl ? parseInt(cl) : null);
      const acceptRanges = response.headers.get("accept-ranges");
      const finalUrl = response.url;
      const isHls = ct.includes("mpegurl") || ct.includes("mpegURL") || finalUrl.toLowerCase().includes(".m3u8");
      const isDash = ct.includes("dash+xml") || ct.includes("mpd") || finalUrl.toLowerCase().includes(".mpd");

      // Read magic bytes only when safe (Range accepted → body is just 1 byte)
      let magic = null;
      if (useRange && response.body) {
        const reader = response.body.getReader();
        const first = await reader.read();
        if (first.value && first.value.length > 0) {
          magic = Array.from(new Uint8Array(first.value));
        }
        reader.releaseLock();
      }

      console.log(`[proxy-resolve] final: ${finalUrl}  status: ${response.status}  type: ${ct}  len: ${contentLength}  hls: ${isHls}  dash: ${isDash}  range: ${useRange}`);

      const info = { url: finalUrl, status: response.status, contentType: ct, contentLength, acceptRanges, isHls, isDash, magic, useRange };

      if (isHls) {
        try {
          const pr = await fetch(finalUrl, { redirect: "follow", headers: { "User-Agent": headers["User-Agent"], Referer: headers["Referer"] } });
          const raw = await pr.text();
          const base = finalUrl.substring(0, finalUrl.lastIndexOf("/") + 1);
          info.isHlsMaster = raw.includes("#EXT-X-STREAM-INF");
          info.playlist = raw.split("\n").map(line => {
            if (line.startsWith("#") || line.trim() === "") return line;
            try { new URL(line); return line; } catch (e) { return base + line; }
          }).join("\n");
        } catch (e) { console.error(`[proxy-resolve] playlist error: ${e.message}`); }
      }

      if (isDash) {
        try {
          const dr = await fetch(finalUrl, { redirect: "follow", headers: { "User-Agent": headers["User-Agent"], Referer: headers["Referer"] } });
          const raw = await dr.text();
          const base = finalUrl.substring(0, finalUrl.lastIndexOf("/") + 1);
          info.manifest = raw.replace(/(baseURL|media|initialization)="([^"]+)"/gi, (m, attr, val) => {
            try { new URL(val); return m; } catch (e) { return `${attr}="${base}${val}"`; }
          });
        } catch (e) { console.error(`[proxy-resolve] manifest error: ${e.message}`); }
      }

      cb(info);
    } catch (e) {
      console.error(`[proxy-resolve] error: ${e.message}`);
      cb({ error: e.message });
    }
  });

  socket.on("proxy-fetch-url", async (url, cb) => {
    try {
      const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
      try { headers["Referer"] = new URL(url).origin + "/"; } catch (e) {}
      const response = await fetch(url, { redirect: "follow", headers });
      const text = await response.text();
      cb({ content: text, url: response.url, contentType: response.headers.get("content-type") || "" });
    } catch (e) { cb({ error: e.message }); }
  });

  async function startProxyFetch(room, roomCode, url, startByte, opts) {
    try {
      const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
      try { headers["Referer"] = new URL(url).origin + "/"; } catch (e) {}
      try { headers["Origin"] = new URL(url).origin; } catch (e) {}
      if (opts && opts.customHeaders) Object.assign(headers, opts.customHeaders);

      if (startByte > 0) headers["Range"] = `bytes=${startByte}-`;

      const response = await fetch(url, { redirect: "follow", headers });

      if (response.status !== 200 && response.status !== 206 && response.status !== 304) {
        throw new Error("Upstream returned status " + response.status);
      }

      const metaHeaders = {
        contentType: response.headers.get("content-type") || "",
        contentLength: response.headers.get("content-length") ? parseInt(response.headers.get("content-length")) : null,
        contentRange: response.headers.get("content-range") || null,
      };
      io.to(roomCode).emit("proxy-meta", metaHeaders);

      if (!response.body) throw new Error("No response body");

      let bufs = [];
      let bufsLen = 0;
      const CHUNK_SIZE = 256 * 1024;

      for await (const chunk of response.body) {
        if (!rooms[roomCode]) break;
        bufs.push(chunk);
        bufsLen += chunk.length;
        if (bufsLen >= CHUNK_SIZE) {
          const combined = Buffer.concat(bufs);
          room.proxyChunks.push(combined);
          io.to(roomCode).emit("proxy-chunk", { d: combined, last: false });
          bufs = [];
          bufsLen = 0;
        }
      }

      if (bufsLen > 0 && rooms[roomCode]) {
        const combined = Buffer.concat(bufs);
        room.proxyChunks.push(combined);
        io.to(roomCode).emit("proxy-chunk", { d: combined, last: false });
      }

      if (rooms[roomCode]) {
        room.proxyFetching = false;
        room.total = room.proxyChunks.length;
        io.to(roomCode).emit("proxy-end");
      }
    } catch (e) {
      console.error(`[proxy-fetch] error: ${e.message}`);
      if (rooms[roomCode]) {
        rooms[roomCode].proxyFetching = false;
        io.to(roomCode).emit("proxy-error", e.message);
      }
    }
  }

  socket.on("proxy-play", ({ url, startByte, contentType }) => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id) return;
    if (contentType && room.meta) room.meta.type = contentType;
    room.proxyChunks = [];
    room.proxyFetching = true;
    room.proxyPos = startByte || 0;
    startProxyFetch(room, socket.data.room, url, startByte || 0);
  });

  socket.on("proxy-seek", ({ url, byteOffset }) => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id) return;
    room.proxyChunks = [];
    room.proxyFetching = true;
    room.proxyPos = byteOffset || 0;
    io.to(socket.data.room).emit("proxy-flush");
    startProxyFetch(room, socket.data.room, url, byteOffset || 0);
  });

  socket.on("chat", ({ n, m }) => {
    const room = rooms[socket.data.room];
    if (room) io.to(socket.data.room).emit("chat", { n, m, id: Date.now() });
  });

  socket.on("resolve-url", async (url, cb) => {
    if (typeof url !== "string" || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return cb({ error: "Invalid URL", url: url || "" });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
      clearTimeout(timeout);
      // Consume body to release the connection
      await response.body?.cancel();
      cb({ url: response.url });
    } catch (e) {
      cb({ error: e.message, url });
    }
  });

  socket.on("vlc-transcode", (url, cb) => {
    const code = socket.data.room;
    if (!code || !rooms[code] || rooms[code].host !== socket.id) return cb({ error: "Not authorized" });
    if (!url.startsWith("rtsp://") && !url.startsWith("rtmp://") && !url.startsWith("mms://")) return cb({ error: "Unsupported protocol" });

    // Kill any existing ffmpeg process for this room
    if (ffmpegProcesses[code]) {
      try { ffmpegProcesses[code].kill(); } catch (e) {}
    }
    // Clean up old HLS files for this room
    const roomDir = path.join(HLS_DIR, code);
    if (fs.existsSync(roomDir)) {
      try { fs.rmSync(roomDir, { recursive: true, force: true }); } catch (e) {}
    }

    fs.mkdirSync(roomDir, { recursive: true });
    const outputPath = path.join(roomDir, "index.m3u8");
    const segPattern = path.join(roomDir, "seg%03d.ts");

    const ff = spawn("ffmpeg", [
      "-i", url,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "zerolatency",
      "-c:a", "aac",
      "-f", "hls",
      "-hls_time", "2",
      "-hls_list_size", "5",
      "-hls_flags", "delete_segments",
      "-hls_segment_filename", segPattern,
      outputPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    ffmpegProcesses[code] = ff;

    let started = false;
    const checkInterval = setInterval(() => {
      if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 0 && !started) {
          started = true;
          clearInterval(checkInterval);
          cb({ url: `/hls/${code}/index.m3u8` });
        }
      }
    }, 500);

    // Timeout after 30s if playlist never appears
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!started) {
        try { ff.kill(); } catch (e) {}
        delete ffmpegProcesses[code];
        cb({ error: "ffmpeg did not produce output within 30 seconds" });
      }
    }, 30000);

    ff.stderr.on("data", (d) => {
      const msg = d.toString();
      // Only log ffmpeg errors, not routine status
      if (msg.toLowerCase().includes("error")) console.error(`[ffmpeg:${code}] ${msg.trim()}`);
    });

    ff.on("exit", (code_) => {
      clearInterval(checkInterval);
      delete ffmpegProcesses[code];
      if (!started) cb({ error: `ffmpeg exited with code ${code_}` });
    });
  });

  socket.on("reset", () => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      // Kill ffmpeg if running
      const code = socket.data.room;
      if (ffmpegProcesses[code]) {
        try { ffmpegProcesses[code].kill(); } catch (e) {}
        delete ffmpegProcesses[code];
      }
      room.meta = null;
      room.state = { p: false, t: 0 };
      room.chunks = [];
      room.total = 0;
      room.proxyChunks = [];
      room.proxyFetching = false;
      deleteChunksFile(code);
      socket.to(code).emit("reset");
      scheduleSave();
    }
  });

  socket.on("reclaim-host", (code, cb) => {
    const room = rooms[code];
    if (room) {
      if (room.host) delete room.users[room.host];
      room.host = socket.id;
      room._abandonedAt = null;
      socket.data.room = code;
      socket.join(code);
      room.users[socket.id] = { n: "Host" };
      cb({ ok: true, state: room.state, meta: room.meta, total: room.total });
      io.to(code).emit("count", Object.keys(room.users).length);
      scheduleSave();
    } else {
      cb({ err: "Room not found." });
    }
  });

  socket.on("sync-state", ({ t, p }) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.state = { p, t };
      socket.to(socket.data.room).emit("sync-state", { t, p });
      scheduleSave();
    }
  });

  socket.on("yt-sync", ({ t }) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.state = { p: true, t };
      socket.to(socket.data.room).emit("yt-sync", { t });
      scheduleSave();
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;

    const wasHost = socket.id === room.host;
    delete room.users[socket.id];

    if (wasHost) {
      room.host = null;
      room._abandonedAt = Date.now();
      io.to(code).emit("count", Object.keys(room.users).length);
      // Kill ffmpeg if running
      if (ffmpegProcesses[code]) {
        try { ffmpegProcesses[code].kill(); } catch (e) {}
        delete ffmpegProcesses[code];
      }
    } else if (Object.keys(room.users).length === 0 && !room.host) {
      room._abandonedAt = Date.now();
    } else {
      io.to(code).emit("count", Object.keys(room.users).length);
    }

    scheduleSave();
  });
});

// Catch unhandled promise rejections to prevent crashes
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err?.message || err);
});

server.listen(PORT, () => {
  console.log(`ViewNoveen running on http://0.0.0.0:${PORT}`);
});

const SELF_URL = process.env.RAILWAY_PRIVATE_URL || process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`;
const agent = SELF_URL.startsWith("https") ? https : http;
setInterval(() => {
  agent.get(SELF_URL, (res) => {
    console.log(`Self-ping: ${res.statusCode}`);
  }).on("error", (err) => {
    console.error(`Self-ping failed: ${err.message}`);
  });
}, 4 * 60 * 1000);
