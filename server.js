const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const ID_VALIDO = /^[\w-]{11}$/;

const sala = { videoId: null, playing: false, position: 0, updatedAt: Date.now() };

function estadoAtual() {
  const decorrido = (Date.now() - sala.updatedAt) / 1000;
  const position = sala.playing ? sala.position + decorrido : sala.position;
  return { videoId: sala.videoId, playing: sala.playing, position };
}

function atualizar(playing, position) {
  const p = Number(position);
  if (!Number.isFinite(p) || p < 0) return false;
  sala.playing = playing;
  sala.position = p;
  sala.updatedAt = Date.now();
  return true;
}

io.on("connection", (socket) => {
  console.log("Alguém conectou:", socket.id);

  socket.on("pedirEstado", () => socket.emit("estado", estadoAtual()));

  socket.on("carregar", (videoId) => {
    if (typeof videoId !== "string" || !ID_VALIDO.test(videoId)) return;
    sala.videoId = videoId;
    atualizar(true, 0);
    io.emit("estado", estadoAtual());
  });

  socket.on("tocar", (position) => {
    if (atualizar(true, position)) socket.broadcast.emit("estado", estadoAtual());
  });

  socket.on("pausar", (position) => {
    if (atualizar(false, position)) socket.broadcast.emit("estado", estadoAtual());
  });

  socket.on("disconnect", () => console.log("Alguém saiu:", socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`smmhy rodando em http://localhost:${PORT}`);
});