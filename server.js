const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Resolve public folder — works regardless of cwd
const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error(`❌ ERROR: 'public' folder not found at ${PUBLIC_DIR}`);
  console.error("Make sure server.js and the 'public' folder are in the same directory.");
  process.exit(1);
}

// Serve static files
app.use(express.static(PUBLIC_DIR));

// Explicit root fallback — catches any edge cases
app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Waiting queues
const waitingVideoQueue = [];
const waitingAudioQueue = [];

// Active rooms: roomId -> [socketId1, socketId2]
const rooms = new Map();
// Socket -> room mapping
const socketRooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 10);
}

function matchUsers(queue, socket, mode) {
  const idx = queue.indexOf(socket.id);
  if (idx !== -1) {
    // Already in queue, remove duplicate
    queue.splice(idx, 1);
  }

  if (queue.length > 0) {
    const partnerId = queue.shift();
    const partnerSocket = io.sockets.sockets.get(partnerId);

    if (!partnerSocket || !partnerSocket.connected) {
      // Partner disconnected, try again
      matchUsers(queue, socket, mode);
      return;
    }

    const roomId = generateRoomId();
    rooms.set(roomId, [socket.id, partnerId]);
    socketRooms.set(socket.id, roomId);
    socketRooms.set(partnerId, roomId);

    // Notify both: socket is caller, partner is callee
    socket.join(roomId);
    partnerSocket.join(roomId);

    socket.emit("matched", { roomId, isCaller: true, mode });
    partnerSocket.emit("matched", { roomId, isCaller: false, mode });

    console.log(`[MATCH] Room ${roomId} created for ${socket.id} & ${partnerId} (${mode})`);
  } else {
    queue.push(socket.id);
    socket.emit("waiting");
    console.log(`[WAIT] ${socket.id} waiting for ${mode} match. Queue: ${queue.length}`);
  }
}

function leaveRoom(socket) {
  const roomId = socketRooms.get(socket.id);
  if (roomId) {
    const roomMembers = rooms.get(roomId);
    if (roomMembers) {
      const partnerId = roomMembers.find((id) => id !== socket.id);
      if (partnerId) {
        const partnerSocket = io.sockets.sockets.get(partnerId);
        if (partnerSocket) {
          partnerSocket.emit("partner_left");
        }
      }
      rooms.delete(roomId);
    }
    socketRooms.delete(socket.id);
    socket.leave(roomId);
  }

  // Remove from queues
  const vi = waitingVideoQueue.indexOf(socket.id);
  if (vi !== -1) waitingVideoQueue.splice(vi, 1);
  const ai = waitingAudioQueue.indexOf(socket.id);
  if (ai !== -1) waitingAudioQueue.splice(ai, 1);
}

io.on("connection", (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  socket.on("find_match", ({ mode }) => {
    leaveRoom(socket);
    const queue = mode === "video" ? waitingVideoQueue : waitingAudioQueue;
    matchUsers(queue, socket, mode);
  });

  // WebRTC Signaling relay
  socket.on("offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("offer", { offer });
  });

  socket.on("answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("answer", { answer });
  });

  socket.on("ice_candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice_candidate", { candidate });
  });

  socket.on("chat_message", ({ roomId, message }) => {
    socket.to(roomId).emit("chat_message", { message });
  });

  socket.on("skip", () => {
    leaveRoom(socket);
    socket.emit("skipped");
  });

  socket.on("disconnect", () => {
    leaveRoom(socket);
    console.log(`[DISCONNECT] ${socket.id}`);
  });
});

// Online count broadcast
setInterval(() => {
  io.emit("online_count", io.sockets.sockets.size);
}, 3000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 RandomChat server running at http://localhost:${PORT}\n`);
});
