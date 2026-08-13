const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7 // 10MB payload limit for image data
});

const PORT = process.env.PORT || 3000;

// Everything here lives only in RAM.
// Restarting the server clears all rooms and messages.
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Map(),
      messages: []
    });
  }
  return rooms.get(roomId);
}

function cleanRoom(roomId) {
  const room = rooms.get(roomId);
  if (room && room.users.size === 0) {
    rooms.delete(roomId);
  }
}

const ALLOWED_ROOM = "69420";

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    roomId = String(roomId || "").trim().toUpperCase();
    username = String(username || "").trim().slice(0, 30);

    if (!roomId || !username) {
      socket.emit("join-error", "Room code and username are required.");
      return;
    }

    if (roomId !== ALLOWED_ROOM) {
      socket.emit("join-error", "Room not found");
      return;
    }

    const room = getRoom(roomId);

    // Only two people are allowed in a room.
    if (room.users.size >= 2 && !room.users.has(socket.id)) {
      socket.emit("join-error", "Room is locked");
      return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;

    room.users.set(socket.id, username);

    socket.emit("chat-history", room.messages);

    socket.emit("joined-room", {
      roomId,
      username,
      users: [...room.users.values()]
    });

    socket.to(roomId).emit("user-joined", {
      username,
      users: [...room.users.values()]
    });

    io.to(roomId).emit("room-status", {
      count: room.users.size,
      users: [...room.users.values()]
    });
  });

  socket.on("send-message", (payload) => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;

    if (!roomId || !username) return;

    let text = "";
    let image = null;

    if (typeof payload === "string") {
      text = payload.trim();
    } else if (payload && typeof payload === "object") {
      text = String(payload.text || "").trim();
      if (typeof payload.image === "string" && payload.image.startsWith("data:image/")) {
        // Limit base64 image string length to ~8MB to protect memory
        if (payload.image.length <= 10 * 1024 * 1024) {
          image = payload.image;
        }
      }
    }

    if (text.length > 2000) {
      text = text.slice(0, 2000);
    }

    // Must have either text or image
    if (!text && !image) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Mark previous messages from other user as seen since this user is sending a message
    for (const msg of room.messages) {
      if (msg.username !== username && !msg.seen) {
        msg.seen = true;
        msg.seenAt = new Date().toISOString();
      }
    }

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      username,
      text: text || null,
      image: image || null,
      timestamp: new Date().toISOString(),
      seen: false,
      seenAt: null
    };

    room.messages.push(message);

    // Keep only the latest 100 messages in memory.
    if (room.messages.length > 100) {
      room.messages.shift();
    }

    io.to(roomId).emit("new-message", message);
  });

  socket.on("mark-seen", () => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;
    if (!roomId || !username) return;

    const room = rooms.get(roomId);
    if (!room) return;

    let hasUnseen = false;
    for (const msg of room.messages) {
      if (msg.username !== username && !msg.seen) {
        msg.seen = true;
        msg.seenAt = new Date().toISOString();
        hasUnseen = true;
      }
    }

    if (hasUnseen) {
      socket.to(roomId).emit("messages-seen", {
        seenBy: username,
        seenAt: new Date().toISOString()
      });
    }
  });

  socket.on("typing", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    socket.to(roomId).emit("typing", {
      username: socket.data.username
    });
  });

  socket.on("stop-typing", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    socket.to(roomId).emit("stop-typing");
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;

    if (!roomId) {
      console.log("Disconnected:", socket.id);
      return;
    }

    const room = rooms.get(roomId);

    if (room) {
      room.users.delete(socket.id);

      socket.to(roomId).emit("user-left", {
        username,
        users: [...room.users.values()]
      });

      io.to(roomId).emit("room-status", {
        count: room.users.size,
        users: [...room.users.values()]
      });

      cleanRoom(roomId);
    }

    console.log(`${username || socket.id} disconnected`);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});
