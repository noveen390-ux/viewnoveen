const { io } = require("socket.io-client");

const HOST = io("http://localhost:3456");
const VIEWER = io("http://localhost:3456");

let hostConnected = false;
let viewerConnected = false;
let roomCode = null;

HOST.on("connect", () => {
  console.log("[HOST] connected:", HOST.id);
  hostConnected = true;
  HOST.emit("create", (res) => {
    roomCode = res.code;
    console.log("[HOST] created room:", roomCode);
    tryJoinViewer();
  });
});

VIEWER.on("connect", () => {
  console.log("[VIEWER] connected:", VIEWER.id);
  viewerConnected = true;
  tryJoinViewer();
});

function tryJoinViewer() {
  if (!roomCode || !viewerConnected) return;
  VIEWER.emit("join", { c: roomCode, n: "TestViewer" }, (res) => {
    console.log("[VIEWER] join result:", JSON.stringify(res));
    if (res.ok) {
      runTest();
    } else {
      console.log("[TEST] FAILED - viewer could not join");
      cleanup();
    }
  });
}

function runTest() {
  // Host loads a YouTube video (simulated)
  HOST.emit("meta", { source: "youtube", videoId: "dQw4w9WgXcQ" });
  console.log("[HOST] emitted meta");

  setTimeout(() => {
    // VIEWER listens for reset
    VIEWER.on("reset", () => {
      console.log("[VIEWER] *** RECEIVED reset event *** - PASS");
    });

    // HOST clicks Back
    console.log("[HOST] emitting reset (simulating Back click)...");
    HOST.emit("reset");

    setTimeout(() => {
      console.log("[TEST] done - checking if reset was received");
      cleanup();
    }, 1000);
  }, 500);
}

function cleanup() {
  HOST.close();
  VIEWER.close();
  process.exit(0);
}

setTimeout(() => {
  console.log("[TEST] TIMEOUT");
  process.exit(1);
}, 10000);
