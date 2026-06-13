const { io } = require("socket.io-client");

const HOST = io("http://localhost:3456", { forceNew: true });
const VIEWER1 = io("http://localhost:3456", { forceNew: true });
const VIEWER2 = io("http://localhost:3456", { forceNew: true });

let roomCode = null;
let connections = 0;

function onConnect() {
  connections++;
  if (connections === 3) startTest();
}

HOST.on("connect", onConnect);
VIEWER1.on("connect", onConnect);
VIEWER2.on("connect", onConnect);

let v2MetaReceived = false;
let v2StateReceived = false;

function startTest() {
  console.log("All connected");

  HOST.emit("create", (res) => {
    roomCode = res.code;
    console.log("[HOST] room:", roomCode);

    VIEWER1.emit("join", { c: roomCode, n: "V1" }, () => {
      console.log("[V1] joined");

      // Host loads YouTube
      HOST.emit("meta", { source: "youtube", videoId: "dQw4w9WgXcQ" });
      console.log("[HOST] meta sent");

      setTimeout(() => {
        // Host clicks Back
        HOST.emit("reset");
        console.log("[HOST] reset sent");

        setTimeout(() => {
          // Late joiner V2 joins after Back
          VIEWER2.on("meta", () => {
            v2MetaReceived = true;
            console.log("[V2] meta received - FAIL (should not get meta after Back)");
          });

          VIEWER2.on("state", (s) => {
            v2StateReceived = true;
            console.log("[V2] state:", JSON.stringify(s));
            if (s && s.p === false && s.t === 0) {
              console.log("[V2] state correctly cleared - PASS");
            } else {
              console.log("[V2] state NOT cleared - FAIL");
            }
          });

          // Also listen for count to know V2 is fully joined
          VIEWER2.on("count", () => {
            console.log("[V2] fully joined (got count)");
          });

          VIEWER2.emit("join", { c: roomCode, n: "V2" }, () => {
            console.log("[V2] joined after Back");

            setTimeout(() => {
              if (!v2MetaReceived) console.log("[V2] no meta - PASS (meta was cleared)");
              if (!v2StateReceived) console.log("[V2] no state - WARN");
              cleanup();
            }, 1500);
          });
        }, 500);
      }, 500);
    });
  });
}

function cleanup() {
  HOST.close();
  VIEWER1.close();
  VIEWER2.close();
  process.exit(0);
}

setTimeout(() => { console.log("[TEST] TIMEOUT"); process.exit(1); }, 20000);
