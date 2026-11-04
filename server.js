require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const ID_VALIDO = /^[\w-]{11}$/;
const LISTA_VALIDA = /^[\w-]{10,80}$/;
const MAX_FILA = 100;
const MAX_POR_PLAYLIST = 50;

const sala = {
  atual: null,
  fila: [],
  playing: false,
  position: 0,
  updatedAt: Date.now(),
};
let proximoId = 1;

function estadoAtual() {
  const decorrido = (Date.now() - sala.updatedAt) / 1000;
  const position = sala.playing ? sala.position + decorrido : sala.position;
  return {
    itemId: sala.atual ? sala.atual.id : null,
    videoId: sala.atual ? sala.atual.videoId : null,
    playing: sala.playing,
    position,
  };
}

function listaFila() {
  return { atual: sala.atual, fila: sala.fila };
}

function atualizar(playing, position) {
  if (!sala.atual) return false;
  const p = Number(position);
  if (!Number.isFinite(p) || p < 0) return false;
  sala.playing = playing;
  sala.position = p;
  sala.updatedAt = Date.now();
  return true;
}

function tocarProximo() {
  sala.atual = sala.fila.shift() || null;
  sala.playing = sala.atual !== null;
  sala.position = 0;
  sala.updatedAt = Date.now();
  io.emit("fila", listaFila());
  io.emit("estado", estadoAtual());
}

function avancarSe(itemId) {
  if (sala.atual && sala.atual.id === itemId) tocarProximo();
}

async function buscarTitulo(videoId) {
  const alvo = "https://www.youtube.com/watch?v=" + videoId;
  const url = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(alvo);
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const dados = await r.json();
  return String(dados.title || "Sem título").slice(0, 150);
}

async function buscarPlaylist(listId) {
  const chave = process.env.YOUTUBE_API_KEY;
  if (!chave) return { erro: "A chave da API do YouTube não está configurada no servidor." };
  const params = new URLSearchParams({
    part: "snippet",
    maxResults: String(MAX_POR_PLAYLIST),
    playlistId: listId,
    key: chave,
  });
  const r = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?" + params, {
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 404) return { erro: "Playlist não encontrada ou privada." };
  if (r.status === 403) return { erro: "Limite diário do YouTube atingido, ou a playlist é privada." };
  if (!r.ok) return { erro: "Não consegui ler a playlist agora." };
  const dados = await r.json();
  const videos = (dados.items || [])
    .filter((i) => i.snippet && i.snippet.resourceId && ID_VALIDO.test(i.snippet.resourceId.videoId || ""))
    .filter((i) => !["Private video", "Deleted video"].includes(i.snippet.title))
    .map((i) => ({
      videoId: i.snippet.resourceId.videoId,
      titulo: String(i.snippet.title).slice(0, 150),
    }));
  return { videos };
}

io.on("connection", (socket) => {
  console.log("Alguém conectou:", socket.id);

  socket.on("entrar", (nick) => {
    socket.data.nick = String(nick || "").trim().slice(0, 20) || "Anônimo";
  });

  socket.on("pedirEstado", () => {
    socket.emit("fila", listaFila());
    socket.emit("estado", estadoAtual());
  });

  socket.on("adicionar", async (videoId) => {
    if (typeof videoId !== "string" || !ID_VALIDO.test(videoId)) return;
    if (sala.fila.length >= MAX_FILA) {
      socket.emit("aviso", "A fila está cheia.");
      return;
    }
    let titulo = null;
    try {
      titulo = await buscarTitulo(videoId);
    } catch {}
    if (!titulo) {
      socket.emit(
        "aviso",
        "Não consegui adicionar: o vídeo pode ser privado, removido ou bloqueado para outros sites."
      );
      return;
    }
    const item = { id: proximoId++, videoId, titulo, nick: socket.data.nick || "Anônimo" };
    sala.fila.push(item);
    if (!sala.atual) tocarProximo();
    else io.emit("fila", listaFila());
  });

  socket.on("adicionarPlaylist", async (listId) => {
    if (typeof listId !== "string" || !LISTA_VALIDA.test(listId)) return;
    let resultado;
    try {
      resultado = await buscarPlaylist(listId);
    } catch {
      resultado = { erro: "Não consegui ler a playlist agora." };
    }
    if (resultado.erro) {
      socket.emit("aviso", resultado.erro);
      return;
    }
    const espaco = Math.max(MAX_FILA - sala.fila.length, 0);
    const escolhidos = resultado.videos.slice(0, espaco);
    if (escolhidos.length === 0) {
      socket.emit("aviso", "Nenhum vídeo disponível para adicionar.");
      return;
    }
    const nick = socket.data.nick || "Anônimo";
    escolhidos.forEach((v) =>
      sala.fila.push({ id: proximoId++, videoId: v.videoId, titulo: v.titulo, nick })
    );
    if (!sala.atual) tocarProximo();
    else io.emit("fila", listaFila());
    socket.emit("aviso", `${escolhidos.length} músicas adicionadas.`);
  });

  socket.on("terminou", avancarSe);
  socket.on("pular", avancarSe);

  socket.on("remover", (itemId) => {
    const antes = sala.fila.length;
    sala.fila = sala.fila.filter((i) => i.id !== itemId);
    if (sala.fila.length !== antes) io.emit("fila", listaFila());
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