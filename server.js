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

io.on("connection", (socket) => {
  console.log("Device connected: " + socket.id);

  socket.on("send-location", (data) => {
    console.log("Location from " + socket.id + ":", data);
    // Broadcast to all OTHER connected devices
    socket.broadcast.emit("receive-location", data);
  });

  socket.on("disconnect", () => {
    console.log("Device disconnected: " + socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
