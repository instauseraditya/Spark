const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve static files from public/
app.use(express.static(path.join(__dirname, "public")));

// Always serve index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Queues & Rooms
const videoQueue = [];
const audioQueue = [];
const rooms = new Map();
const socketRoom = new Map();

function makeRoomId() {
  return Math.random().toString(36).slice(2, 10);
}

function match(queue, socket, mode) {
  const i = queue.indexOf(socket.id);
  if (i !== -1) queue.splice(i, 1);

  if (queue.length > 0) {
    const partnerId = queue.shift();
    const partner = io.sockets.sockets.get(partnerId);

    if (!partner || !partner.connected) {
      return match(queue, socket, mode);
    }

    const roomId = makeRoomId();
    rooms.set(roomId, [socket.id, partnerId]);
    socketRoom.set(socket.id, roomId);
    socketRoom.set(partnerId, roomId);

    socket.join(roomId);
    partner.join(roomId);

    socket.emit("matched", { roomId, isCaller: true, mode });
    partner.emit("matched", { roomId, isCaller: false, mode });
    console.log("[MATCH] " + socket.id + " <-> " + partnerId + " room=" + roomId);
  } else {
    queue.push(socket.id);
    socket.emit("waiting");
    console.log("[WAIT] " + socket.id + " queue=" + queue.length);
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

io.on("connection", function(socket) {
  console.log("[CONNECT] " + socket.id);

  socket.on("find_match",    function(data) { leave(socket); match(data.mode === "video" ? videoQueue : audioQueue, socket, data.mode); });
  socket.on("offer",         function(data) { socket.to(data.roomId).emit("offer",         { offer: data.offer }); });
  socket.on("answer",        function(data) { socket.to(data.roomId).emit("answer",        { answer: data.answer }); });
  socket.on("ice_candidate", function(data) { socket.to(data.roomId).emit("ice_candidate", { candidate: data.candidate }); });
  socket.on("chat_message",  function(data) { socket.to(data.roomId).emit("chat_message",  { message: data.message }); });
  socket.on("skip",          function()     { leave(socket); socket.emit("skipped"); });
  socket.on("disconnect",    function()     { leave(socket); console.log("[DISCONNECT] " + socket.id); });
});

setInterval(function() { io.emit("online_count", io.sockets.sockets.size); }, 3000);

var PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", function() {
  console.log("Server started on port " + PORT);
});
