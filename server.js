const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error("❌ 'public' folder not found at: " + PUBLIC_DIR);
  console.error("Fix: make sure server.js and the public/ folder are in the SAME folder.");
  process.exit(1);
}

app.use(express.static(PUBLIC_DIR));
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

// ── Queues & Rooms ──────────────────────────────────────────────────
const videoQueue = [];
const audioQueue = [];
const rooms = new Map();       // roomId → [id1, id2]
const socketRoom = new Map();  // socketId → roomId

function makeRoomId() {
  return Math.random().toString(36).slice(2, 10);
}

function match(queue, socket, mode) {
  // Remove duplicates
  const i = queue.indexOf(socket.id);
  if (i !== -1) queue.splice(i, 1);

  if (queue.length > 0) {
    const partnerId = queue.shift();
    const partner = io.sockets.sockets.get(partnerId);

    if (!partner || !partner.connected) {
      return match(queue, socket, mode); // try next
    }

    const roomId = makeRoomId();
    rooms.set(roomId, [socket.id, partnerId]);
    socketRoom.set(socket.id, roomId);
    socketRoom.set(partnerId, roomId);

    socket.join(roomId);
    partner.join(roomId);

    socket.emit("matched", { roomId, isCaller: true, mode });
    partner.emit("matched", { roomId, isCaller: false, mode });
    console.log(`[MATCH] ${socket.id} ↔ ${partnerId}  room=${roomId}`);
  } else {
    queue.push(socket.id);
    socket.emit("waiting");
    console.log(`[WAIT]  ${socket.id}  queue=${queue.length}`);
  }
}

function leave(socket) {
  const roomId = socketRoom.get(socket.id);
  if (roomId) {
    const members = rooms.get(roomId);
    if (members) {
      const partnerId = members.find(id => id !== socket.id);
      if (partnerId) {
        const partner = io.sockets.sockets.get(partnerId);
        if (partner) partner.emit("partner_left");
      }
      rooms.delete(roomId);
    }
    socketRoom.delete(socket.id);
    socket.leave(roomId);
  }
  const vi = videoQueue.indexOf(socket.id);
  if (vi !== -1) videoQueue.splice(vi, 1);
  const ai = audioQueue.indexOf(socket.id);
  if (ai !== -1) audioQueue.splice(ai, 1);
}

// ── Socket Events ───────────────────────────────────────────────────
io.on("connection", socket => {
  console.log(`[CONNECT]    ${socket.id}`);

  socket.on("find_match",    ({ mode }) => { leave(socket); match(mode === "video" ? videoQueue : audioQueue, socket, mode); });
  socket.on("offer",         ({ roomId, offer })      => socket.to(roomId).emit("offer",         { offer }));
  socket.on("answer",        ({ roomId, answer })     => socket.to(roomId).emit("answer",        { answer }));
  socket.on("ice_candidate", ({ roomId, candidate })  => socket.to(roomId).emit("ice_candidate", { candidate }));
  socket.on("chat_message",  ({ roomId, message })    => socket.to(roomId).emit("chat_message",  { message }));
  socket.on("skip",          ()                       => { leave(socket); socket.emit("skipped"); });
  socket.on("disconnect",    ()                       => { leave(socket); console.log(`[DISCONNECT] ${socket.id}`); });
});

// Online count every 3s
setInterval(() => io.emit("online_count", io.sockets.sockets.size), 3000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`\n⚡ Spark running on port ${PORT}\n`));
