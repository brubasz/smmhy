const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
  console.log("Alguém conectou:", socket.id);
  socket.on("disconnect", () => console.log("Alguém saiu:", socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`smmhy rodando em http://localhost:${PORT}`);
});