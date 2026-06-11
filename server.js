const express = require("express");
const http = require("http");
const https = require("https");
const { createServer } = http;
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 100 * 1024 * 1024,
  cors: { origin: "*" },
});

const PORT = process.env.PORT || process.env.PORT || 3000;
const rooms = {};

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
      room.total = m.t;
      room.chunks = new Array(m.t);
      socket.to(socket.data.room).emit("meta", m);
    }
  });

  socket.on("chunk", (d) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id && d.i < room.total) {
      room.chunks[d.i] = d.d;
      socket.to(socket.data.room).emit("chunk", d);
    }
  });

  socket.on("play", (t) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.state = { p: true, t };
      socket.to(socket.data.room).emit("play", t);
    }
  });

  socket.on("pause", (t) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.state = { p: false, t };
      socket.to(socket.data.room).emit("pause", t);
    }
  });

  socket.on("seek", (t) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.state = { ...room.state, t };
      socket.to(socket.data.room).emit("seek", t);
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
      socket.to(socket.data.room).emit("reset");
    }
  });

  socket.on("reclaim-host", (code, cb) => {
    const room = rooms[code];
    if (room) {
      // Remove old host entry if exists
      if (room.host) delete room.users[room.host];
      room.host = socket.id;
      socket.data.room = code;
      socket.join(code);
      room.users[socket.id] = { n: "Host" };
      cb({ ok: true, state: room.state, hasMeta: !!room.meta, total: room.total });
      io.to(code).emit("count", Object.keys(room.users).length);
    } else {
      cb({ err: "Room not found." });
    }
  });

  socket.on("sync-state", ({ t, p }) => {
    const room = rooms[socket.data.room];
    if (room && room.host === socket.id) {
      room.state = { p, t };
      socket.to(socket.data.room).emit("sync-state", { t, p });
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;

    delete room.users[socket.id];

    if (socket.id === room.host || Object.keys(room.users).length === 0) {
      delete rooms[code];
      io.to(code).emit("end");
    } else {
      io.to(code).emit("count", Object.keys(room.users).length);
    }
  });
});

server.listen(PORT, () => {
  console.log(`ViewNoveen running on http://0.0.0.0:${PORT}`);
});

// Self-ping every 4 minutes to prevent Railway cold starts
const SELF_URL = process.env.RAILWAY_PRIVATE_URL || process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`;
const agent = SELF_URL.startsWith("https") ? https : http;
setInterval(() => {
  agent.get(SELF_URL, (res) => {
    console.log(`Self-ping: ${res.statusCode}`);
  }).on("error", (err) => {
    console.error(`Self-ping failed: ${err.message}`);
  });
}, 4 * 60 * 1000);

