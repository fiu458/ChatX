const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const PORT = process.env.PORT || 3000;
const usersBySocket = new Map();
const onlineUsers = new Map();

app.get("/", (_req, res) => {
  res.json({
    app: "ChatX",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

io.on("connection", (socket) => {
  socket.on("join_room", ({ username, room }) => {
    const safeUsername = (username || "Guest").trim().slice(0, 24);
    const safeRoom = (room || "general").trim().toLowerCase().slice(0, 32);

    usersBySocket.set(socket.id, { username: safeUsername, room: safeRoom });
    onlineUsers.set(socket.id, safeUsername);
    socket.join(safeRoom);

    io.to(safeRoom).emit("room_users", {
      room: safeRoom,
      users: Array.from(io.sockets.adapter.rooms.get(safeRoom) || []).map(
        (id) => onlineUsers.get(id) || "Guest"
      ),
    });

    socket.to(safeRoom).emit("system_message", {
      text: `${safeUsername} joined #${safeRoom}`,
      ts: Date.now(),
    });
  });

  socket.on("send_message", ({ text }) => {
    const session = usersBySocket.get(socket.id);
    if (!session || !text || !text.trim()) {
      return;
    }

    io.to(session.room).emit("receive_message", {
      text: text.trim().slice(0, 1200),
      username: session.username,
      room: session.room,
      ts: Date.now(),
    });
  });

  socket.on("disconnect", () => {
    const session = usersBySocket.get(socket.id);
    usersBySocket.delete(socket.id);
    onlineUsers.delete(socket.id);

    if (!session) {
      return;
    }

    const roomSet = io.sockets.adapter.rooms.get(session.room) || new Set();

    io.to(session.room).emit("room_users", {
      room: session.room,
      users: Array.from(roomSet).map((id) => onlineUsers.get(id) || "Guest"),
    });

    socket.to(session.room).emit("system_message", {
      text: `${session.username} left #${session.room}`,
      ts: Date.now(),
    });
  });
});

server.listen(PORT, () => {
  console.log(`ChatX server running on port ${PORT}`);
});
