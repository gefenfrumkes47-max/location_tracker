const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Serve the frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const MAX_DEVICES = 2;
let connectedCount = 0;

io.on("connection", (socket) => {
  connectedCount++;

  if (connectedCount > MAX_DEVICES) {
    console.log("Connection rejected (limit reached): " + socket.id);
    socket.emit("server-full", { message: "השרת מלא — כבר מחוברים 2 מכשירים" });
    socket.disconnect(true);
    connectedCount--;
    return;
  }

  console.log(`Device connected: ${socket.id} (${connectedCount}/${MAX_DEVICES})`);
  io.emit("device-count", { count: connectedCount });

  socket.on("send-location", (data) => {
    // Broadcast to all OTHER connected devices
    socket.broadcast.emit("receive-location", data);
  });

  socket.on("disconnect", () => {
    connectedCount--;
    console.log(`Device disconnected: ${socket.id} (${connectedCount}/${MAX_DEVICES})`);
    io.emit("device-count", { count: connectedCount });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
