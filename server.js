const express = require("express");
const http = require("http");
const https = require("https");
const { createServer } = http;
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");


const app = express();
const server = createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1024 * 1024 * 1024,
  cors: { origin: "*" },
  pingTimeout: 20000,
  pingInterval: 8000,
  transports: ["websocket", "polling"],
  allowUpgrades: true,
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const ROOMS_FILE = path.join(DATA_DIR, "rooms.json");
let rooms = {};


const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const roomUploads = {}; // roomCode -> { file, uploadedAt }
const MAX_UPLOADS_PER_ROOM = 3;
const UPLOAD_SIZE_LIMIT = 5 * 1024 * 1024 * 1024; // 5GB
const UPLOAD_DIR_SIZE_LIMIT = 50 * 1024 * 1024 * 1024; // 50GB total

let _totalUploadedBytes = 0;

function isHostInRoom(socket) {
  const room = rooms[socket.data.room];
  return room && room.host === socket.id;
}
let _globalChatId = 0;

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
        r.subtitleVtt = r.subtitleVtt || null;
        r._seq = r._seq || (r.state ? r.state._seq : 0) || 0;
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
        hostToken: r.hostToken,
        total: r.total,
        state: r.state,
        subtitleVtt: r.subtitleVtt || null,
        _seq: r._seq || (r.state ? r.state._seq : 0) || 0,
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
  const UPLOAD_STALE_MS = 1 * 60 * 60 * 1000;
  let changed = false;
  for (const code of Object.keys(rooms)) {
    const room = rooms[code];
    if (!room.host && Object.keys(room.users).length === 0 && room._abandonedAt && now - room._abandonedAt > STALE_MS) {
      deleteChunksFile(code);
      deleteRoomUpload(code);
      delete rooms[code];
      changed = true;
      console.log(`Cleaned up stale room ${code}`);
    }
  }
  // Clean uploaded files for rooms abandoned for 1 hour
  for (const code of Object.keys(roomUploads)) {
    const room = rooms[code];
    const abandonedLongEnough = room && room._abandonedAt && now - room._abandonedAt > UPLOAD_STALE_MS;
    const orphaned = !room && now - roomUploads[code].uploadedAt > UPLOAD_STALE_MS;
    if (abandonedLongEnough || orphaned) {
      deleteRoomUpload(code);
      console.log(`Cleaned up upload for ${code} (abandoned: ${!!abandonedLongEnough}, orphaned: ${!!orphaned})`);
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
<video id="v" src="/proxy?url=${enc}" controls autoplay style="width:100%;height:100vh"
  oncanplay="parent.postMessage('vnsync-video-ready','*')"
  onerror="parent.postMessage('vnsync-video-ready','*')"></video>
<script>
var v=document.getElementById('v');
window.addEventListener('message',function(e){
  var d=typeof e.data==='string'?{type:e.data}:e.data;
  if(d.type==='vnsync-play'){v.play();}
  else if(d.type==='vnsync-pause'){v.pause();}
  else if(d.type==='vnsync-seek'){v.currentTime=d.time;}
});
v.addEventListener('play',function(){parent.postMessage({type:'vnsync-play',time:v.currentTime},'*');});
v.addEventListener('pause',function(){parent.postMessage({type:'vnsync-pause',time:v.currentTime},'*');});
v.addEventListener('seeked',function(){parent.postMessage({type:'vnsync-seeked',time:v.currentTime},'*');});
v.addEventListener('timeupdate',function(){parent.postMessage({type:'vnsync-timeupdate',time:v.currentTime},'*');});
</script>
</body></html>`;
  res.send(page);
});

app.use(express.static(__dirname));

// IPTV M3U parser endpoint
app.get("/api/iptv/m3u", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing url" });
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return res.status(502).json({ error: "Failed to fetch M3U: " + resp.status });
    const text = await resp.text();
    const channels = [];
    const lines = text.split("\n");
    let extinf = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#EXTINF:")) {
        const tvgName = (trimmed.match(/tvg-name="([^"]*)"/) || [])[1] || "";
        const groupTitle = (trimmed.match(/group-title="([^"]*)"/) || [])[1] || "Uncategorized";
        const name = (trimmed.match(/,([^,]*)$/) || [])[1]?.trim() || tvgName;
        const tvgLogo = (trimmed.match(/tvg-logo="([^"]*)"/) || [])[1] || "";
        extinf = { name, group: groupTitle, logo: tvgLogo };
      } else if (trimmed && !trimmed.startsWith("#") && extinf) {
        channels.push({ ...extinf, url: trimmed });
        extinf = null;
      }
    }
    res.json({ channels });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
        if (loc) {
          current = new URL(loc, current).href; continue;
        }
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
    console.log(`[PROXY] streaming ${url}`);
    // Abort only if the upstream never returns response headers (dead/timed-out origin).
    // Cleared as soon as headers arrive, so the body stream stays unbounded for long videos.
    const _connCtrl = new AbortController();
    const _connTimer = setTimeout(() => _connCtrl.abort(), 20000);
    const upstream = await fetch(url, { redirect: "follow", headers, signal: _connCtrl.signal });
    clearTimeout(_connTimer);
    console.log(`[PROXY] req: ${url}  final: ${upstream.url}  status: ${upstream.status}  type: ${upstream.headers.get("content-type") || ""}`);

    // HLS playlists: rewrite segment/variant/key URIs back through this proxy. Otherwise the
    // player resolves relative URIs against the same-origin /proxy base, or fetches absolute
    // URIs directly without the required Referer/Origin headers. Media segments stream normally.
    const _ct = upstream.headers.get("content-type") || "";
    const _finalUrl = upstream.url || url;
    const _isHlsPlaylist =
      _ct.includes("mpegurl") || _ct.includes("mpegURL") ||
      _finalUrl.split("?")[0].toLowerCase().endsWith(".m3u8");
    if (_isHlsPlaylist) {
      const raw = await upstream.text();
      const wrap = (u) => {
        try {
          return "/proxy?url=" + encodeURIComponent(new URL(u, _finalUrl).href);
        } catch (e) {
          return u;
        }
      };
      const rewritten = raw.split("\n").map((line) => {
        const trimmed = line.trim();
        if (trimmed === "") return line;
        if (trimmed.startsWith("#")) {
          // Rewrite URI="..." attributes inside tags (EXT-X-KEY, EXT-X-MEDIA, EXT-X-MAP, ...)
          return line.replace(/URI="([^"]+)"/g, (m, uri) => 'URI="' + wrap(uri) + '"');
        }
        // Segment or variant-playlist URI line
        return wrap(trimmed);
      }).join("\n");
      res.setHeader("content-type", _ct || "application/vnd.apple.mpegurl");
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (!res.destroyed) res.status(200).end(rewritten);
      return;
    }

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

// Upload endpoint for Local Stream - receives raw file binary
app.post("/upload", (req, res) => {
  const filename = req.query.filename;
  const room = req.query.room;
  if (!filename || !room) return res.status(400).json({ error: "Missing filename or room" });

  // Validate room exists
  if (!rooms[room]) return res.status(404).json({ error: "Room not found" });

  const ext = path.extname(filename).toLowerCase();
  if (![".mp4", ".mkv", ".webm", ".mov"].includes(ext)) {
    return res.status(400).json({ error: "Unsupported file type" });
  }

  // Security: validate filename (no path traversal)
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  // Rate limit per room
  const roomUp = roomUploads[room];
  if (roomUp) {
    const uploads = Object.keys(roomUploads).filter(k => k.startsWith(room + "_")).length;
    if (uploads >= MAX_UPLOADS_PER_ROOM) {
      return res.status(429).json({ error: "Too many uploads for this room" });
    }
  }

  // Validate file size from Content-Length header
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  if (contentLength > UPLOAD_SIZE_LIMIT) {
    return res.status(413).json({ error: "File too large. Maximum is 5GB." });
  }
  if (_totalUploadedBytes + contentLength > UPLOAD_DIR_SIZE_LIMIT) {
    return res.status(507).json({ error: "Server storage limit reached" });
  }

  const safeName = room + "_" + Date.now() + ext;
  const filePath = path.join(UPLOADS_DIR, safeName);
  const ws = fs.createWriteStream(filePath);
  let receivedBytes = 0;

  roomUploads[room] = roomUploads[room] || [];
  roomUploads[room].push({ file: safeName, uploadedAt: Date.now() });

  req.on("data", (chunk) => {
    receivedBytes += chunk.length;
    if (receivedBytes > UPLOAD_SIZE_LIMIT) {
      ws.destroy();
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
      return res.status(413).json({ error: "File too large" });
    }
    ws.write(chunk);
  });
  req.on("end", () => {
    ws.end();
    _totalUploadedBytes += receivedBytes;
    res.json({ url: "/video/" + safeName });
  });
  req.on("error", (err) => {
    ws.destroy();
    try {
      fs.unlinkSync(filePath);
    } catch (e) {}
    res.status(500).json({ error: err.message });
  });
});

// Video streaming endpoint with HTTP Range support (206 Partial Content)
app.get("/video/:filename", (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!filePath.startsWith(UPLOADS_DIR)) return res.status(403).end();
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = { ".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska", ".mov": "video/quicktime" };
  const contentType = mimeMap[ext] || "video/mp4";

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": contentType,
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Convert SRT to VTT
function convertSrtToVtt(srt) {
  let vtt = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Strip BOM
  if (vtt.charCodeAt(0) === 0xFEFF) vtt = vtt.slice(1);
  vtt = 'WEBVTT\n\n' + vtt;
  // Replace SRT ms separator (,) with VTT ms separator (.)
  vtt = vtt.replace(/(\d+),(\d{3})/g, '$1.$2');
  // Remove SRT cue sequence numbers (lone digits before timestamps)
  vtt = vtt.replace(/^\d+\n(?=\d{1,2}:\d{2})/gm, '');
  return vtt;
}

// HTTPS helper for OpenSubtitles API
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = {
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`OpenSubtitles API error ${res.statusCode}: ${data.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const doReq = (u) => {
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doReq(res.headers.location); return;
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    };
    doReq(url);
  });
}

// Subtitle endpoint
app.get("/subtitle/:code", (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room || !room.subtitleVtt) return res.status(404).end();
  res.setHeader("Content-Type", "text/vtt; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(room.subtitleVtt);
});

// Clean up uploaded files for abandoned rooms
function deleteRoomUpload(code) {
  if (roomUploads[code]) {
    const f = path.join(UPLOADS_DIR, roomUploads[code].file);
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (e) {}
    delete roomUploads[code];
  }
}

io.on("connection", (socket) => {
  socket.on("create", (cb) => {
    let code;
    do {
      code = crypto.randomBytes(3).toString("hex").toUpperCase();
    } while (rooms[code]);

    const hostToken = crypto.randomUUID();
    rooms[code] = {
      host: socket.id,
      hostToken,
      meta: null,
      chunks: [],
      total: 0,
      state: { p: false, t: 0, _seq: 0 },
      _seq: 0,
      users: {},
    };

    socket.data.room = code;
    socket.join(code);
    rooms[code].users[socket.id] = { n: "Host" };
    io.to(code).emit("count", Object.keys(rooms[code].users).length);
    scheduleSave();
    cb({ code, hostToken });
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
      if (m.source === "youtube" || m.source === "drive" || m.source === "direct" || m.source === "torrent" || m.source === "proxy" || m.source === "localstream") {
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

  // Pure echo ack for client-side RTT measurement — no room state, no broadcast, no side effects
  socket.on("ping-rtt", (clientTime, cb) => {
    if (typeof cb === "function") cb(Date.now());
  });

  socket.on("play", (t) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room._seq = (room._seq || 0) + 1;
      room.state = { p: true, t, _seq: room._seq, savedAt: Date.now() };
      socket.to(socket.data.room).emit("play", { t, _seq: room._seq, savedAt: room.state.savedAt });
      scheduleSave();
    }
  });

  socket.on("pause", (t) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      console.log("SERVER pause from host", { ct: t, sid: socket.id.substring(0, 8), code: socket.data.room, hostSid: room.host.substring(0, 8) });
      room._seq = (room._seq || 0) + 1;
      room.state = { p: false, t, _seq: room._seq, savedAt: Date.now() };
      socket.to(socket.data.room).emit("pause", { t, _seq: room._seq, savedAt: room.state.savedAt });
      scheduleSave();
    }
  });

  socket.on("seek", (t) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room._seq = (room._seq || 0) + 1;
      room.state = { ...room.state, t, _seq: room._seq, savedAt: Date.now() };
      socket.to(socket.data.room).emit("seek", { t, _seq: room._seq, savedAt: room.state.savedAt });
      scheduleSave();
    }
  });

  socket.on("proxy-resolve", async (url, opts, cb) => {
    if (!url) return cb({ error: "Missing url" });
    if (typeof opts === "function") {
      cb = opts; opts = {};
    }
    try {
      const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
      if (opts.referer) headers["Referer"] = opts.referer;
      else {
        try {
          headers["Referer"] = new URL(url).origin + "/";
        } catch (e) {}
      }
      try {
        headers["Origin"] = new URL(url).origin;
      } catch (e) {}
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
            try {
              new URL(line); return line;
            } catch (e) {
              return base + line;
            }
          }).join("\n");
        } catch (e) {
          console.error(`[proxy-resolve] playlist error: ${e.message}`);
        }
      }

      if (isDash) {
        try {
          const dr = await fetch(finalUrl, { redirect: "follow", headers: { "User-Agent": headers["User-Agent"], Referer: headers["Referer"] } });
          const raw = await dr.text();
          const base = finalUrl.substring(0, finalUrl.lastIndexOf("/") + 1);
          info.manifest = raw.replace(/(baseURL|media|initialization)="([^"]+)"/gi, (m, attr, val) => {
            try {
              new URL(val); return m;
            } catch (e) {
              return `${attr}="${base}${val}"`;
            }
          });
        } catch (e) {
          console.error(`[proxy-resolve] manifest error: ${e.message}`);
        }
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
      try {
        headers["Referer"] = new URL(url).origin + "/";
      } catch (e) {}
      const response = await fetch(url, { redirect: "follow", headers });
      const text = await response.text();
      cb({ content: text, url: response.url, contentType: response.headers.get("content-type") || "" });
    } catch (e) {
      cb({ error: e.message });
    }
  });

  async function startProxyFetch(room, roomCode, url, startByte, opts) {
    try {
      const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
      try {
        headers["Referer"] = new URL(url).origin + "/";
      } catch (e) {}
      try {
        headers["Origin"] = new URL(url).origin;
      } catch (e) {}
      if (opts && opts.customHeaders) Object.assign(headers, opts.customHeaders);

      if (startByte > 0) headers["Range"] = `bytes=${startByte}-`;

      const response = await fetch(url, { redirect: "follow", headers });

      if (response.status !== 200 && response.status !== 206) {
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
    if (room) io.to(socket.data.room).emit("chat", { n, m, id: ++_globalChatId, ts: Date.now() });
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

  socket.on("direct-back", () => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.meta = null;
      room._seq = 0;
      room.state = { p: false, t: 0, _seq: 0 };
      room.subtitleVtt = null;
      socket.to(socket.data.room).emit("direct-back");
      scheduleSave();
    }
  });

  socket.on("reset", () => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      const code = socket.data.room;
      room.meta = null;
      room._seq = 0;
      room.state = { p: false, t: 0, _seq: 0 };
      room.chunks = [];
      room.total = 0;
      room.proxyChunks = [];
      room.proxyFetching = false;
      room.subtitleVtt = null;
      deleteChunksFile(code);
      socket.to(code).emit("reset");
      scheduleSave();
    }
  });

  socket.on("reclaim-host", (code, hostToken, cb) => {
    // Backward compatible: old client calls with (code, cb), new with (code, token, cb)
    if (typeof hostToken === "function") {
      cb = hostToken;
      hostToken = undefined;
    }
    const room = rooms[code];
    if (room) {
      if (hostToken !== undefined && hostToken !== room.hostToken) {
        return cb({ err: "Invalid host token." });
      }
      if (room.host) delete room.users[room.host];
      room.host = socket.id;
      room._abandonedAt = null;
      socket.data.room = code;
      socket.join(code);
      room.users[socket.id] = { n: "Host" };
      cb({ ok: true, state: room.state, meta: room.meta, total: room.total, hostToken: room.hostToken });
      io.to(code).emit("host-recovered", room.state);
      io.to(code).emit("count", Object.keys(room.users).length);
      scheduleSave();
    } else {
      cb({ err: "Room not found." });
    }
  });

  socket.on("sync-state", ({ t, p }) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room._seq = (room._seq || 0) + 1;
      room.state = { p, t, _seq: room._seq, savedAt: Date.now() };
      socket.to(socket.data.room).emit("sync-state", { t, p, _seq: room._seq, savedAt: room.state.savedAt });
      scheduleSave();
    }
  });

  // PS3: Respond to sync-request with current room state (for viewer catch-up)
  socket.on("sync-request", () => {
    const room = rooms[socket.data.room];
    if (room && room.state) {
      socket.emit("sync-state", room.state);
    }
  });

  socket.on("yt-sync", ({ t }) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room._seq = (room._seq || 0) + 1;
      room.state = { p: true, t, _seq: room._seq, savedAt: Date.now() };
      socket.to(socket.data.room).emit("yt-sync", { t, _seq: room._seq, savedAt: room.state.savedAt });
      scheduleSave();
    }
  });

  // Subtitle upload (host only)
  socket.on("subtitle-upload", ({ name, content }) => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id) return;
    let vtt = content;
    if (name.toLowerCase().endsWith('.srt')) {
      vtt = convertSrtToVtt(content);
    }
    room.subtitleVtt = vtt;
    io.to(socket.data.room).emit("subtitle-ready");
    scheduleSave();
  });

  // Subtitle check (viewer on join/reconnect)
  socket.on("subtitle-check", () => {
    const room = rooms[socket.data.room];
    if (!room) return;
    socket.emit("subtitle-check-response", { hasSubtitle: !!room.subtitleVtt });
  });

  // Subtitle search (host only)
  socket.on("search-subtitles", async ({ query, language, apiKey }) => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id) return;
    const key = apiKey || process.env.OPENSUBTITLES_API_KEY;
    if (!key) return socket.emit("search-results", { error: "API key not configured. Set OPENSUBTITLES_API_KEY env var or provide a key in the search dialog." });
    try {
      const langs = language ? language + ',en' : 'en';
      const body = JSON.stringify({ query, languages: langs });
      const data = await httpsPost('www.opensubtitles.com', '/api/v1/subtitles', { 'Api-Key': key, 'User-Agent': 'ViewNoveen v1' }, body);
      const results = (data.data || []).map(r => ({
        id: r.id,
        title: r.attributes?.feature_details?.title || query,
        year: r.attributes?.feature_details?.year || '',
        language: (r.attributes?.language || '').toUpperCase(),
        downloads: r.attributes?.download_count || 0,
        rating: r.attributes?.ratings || 0,
        fileId: r.attributes?.files?.[0]?.file_id || null,
      })).filter(r => r.fileId);
      socket.emit("search-results", { results });
    } catch (e) {
      socket.emit("search-results", { error: 'Search failed: ' + e.message });
    }
  });

  // Subtitle download (host only)
  socket.on("download-subtitle", async ({ fileId, apiKey }) => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id) return;
    const key = apiKey || process.env.OPENSUBTITLES_API_KEY;
    if (!key) return socket.emit("subtitle-downloaded", { error: "API key not configured." });
    try {
      const dlBody = JSON.stringify({ file_id: fileId });
      const dlData = await httpsPost('www.opensubtitles.com', '/api/v1/download', { 'Api-Key': key, 'User-Agent': 'ViewNoveen v1', 'Content-Type': 'application/json' }, dlBody);
      const subUrl = dlData.link;
      if (!subUrl) throw new Error('No download link in response');
      let raw = await fetchUrl(subUrl);
      // Detect charset via BOM or meta
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      else if (raw.charCodeAt(0) === 0xFFFE) raw = raw.slice(1);
      // Check if it's SRT or VTT
      const isSrt = raw.includes('-->') ? false : /\d+\s*\n\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(raw) || /^\d+\s*\n\d{1,2}:\d{2}:\d{2}[.,]\d{3}/m.test(raw);
      let vtt = raw;
      if (isSrt) vtt = convertSrtToVtt(raw);
      socket.emit("subtitle-downloaded", { vtt });
    } catch (e) {
      socket.emit("subtitle-downloaded", { error: 'Download failed: ' + e.message });
    }
  });

  // IPTV channel change (host only)
  socket.on("iptv-channel", ({ url, name, logo }) => {
    const room = rooms[socket.data.room];
    if (!room || room.host !== socket.id) return;
    room.iptvChannel = { url, name, logo, updatedAt: Date.now() };
    socket.to(socket.data.room).emit("iptv-channel", { url, name, logo });
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
      io.to(code).emit("end");
      io.to(code).emit("count", Object.keys(room.users).length);
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

