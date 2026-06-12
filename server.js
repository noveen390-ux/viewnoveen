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
  pingTimeout: 60000,
  pingInterval: 10000,
  transports: ["websocket", "polling"],
  allowUpgrades: true,
});

const PORT = process.env.PORT || process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const ROOMS_FILE = path.join(DATA_DIR, "rooms.json");
let rooms = {};

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

app.use(express.static(__dirname));

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
    }

    socket.emit("state", room.state);
    cb({ ok: true });
  });

  socket.on("meta", (m) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.meta = m;
      if (m.source === "youtube" || m.source === "drive" || m.source === "vk" || m.source === "archive") {
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

  socket.on("chat", ({ n, m }) => {
    const room = rooms[socket.data.room];
    if (room) io.to(socket.data.room).emit("chat", { n, m, id: Date.now() });
  });

  socket.on("reset", () => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.meta = null;
      room.chunks = [];
      room.total = 0;
      deleteChunksFile(socket.data.room);
      socket.to(socket.data.room).emit("reset");
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
    } else if (Object.keys(room.users).length === 0 && !room.host) {
      room._abandonedAt = Date.now();
    } else {
      io.to(code).emit("count", Object.keys(room.users).length);
    }

    scheduleSave();
  });
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
