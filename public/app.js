const socket = io();
const statusEl = document.getElementById("status");
const avisoEl = document.getElementById("aviso");
const agoraEl = document.getElementById("agora");
const filaEl = document.getElementById("fila");
const nickEl = document.getElementById("nick");
const linkEl = document.getElementById("link");

let player = null;
let playerPronto = false;
let itemAtual = null;
let meuNick = "";
let ignorarAte = 0;

nickEl.value = localStorage.getItem("smmhy_nick") || "";

socket.on("connect", () => {
  statusEl.textContent = "Conectado ao servidor ✅";
  if (meuNick) socket.emit("entrar", meuNick);
  if (playerPronto) socket.emit("pedirEstado");
});
socket.on("disconnect", () => (statusEl.textContent = "Desconectado ❌"));

function extrairId(texto) {
  const t = texto.trim();
  try {
    const u = new URL(t);
    if (u.hostname === "youtu.be") return u.pathname.slice(1, 12);
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {}
  return /^[\w-]{11}$/.test(t) ? t : null;
}

function temLista(texto) {
  try {
    return new URL(texto.trim()).searchParams.has("list");
  } catch {
    return false;
  }
}

document.getElementById("entrar").addEventListener("click", () => {
  const nick = nickEl.value.trim();
  if (!nick) {
    statusEl.textContent = "Escolha um nick para entrar.";
    return;
  }
  if (typeof YT === "undefined" || !YT.Player) {
    statusEl.textContent = "Carregando o player... tente de novo em um instante.";
    return;
  }
  meuNick = nick;
  localStorage.setItem("smmhy_nick", nick);
  socket.emit("entrar", nick);
  document.getElementById("entrada").style.display = "none";
  document.getElementById("sala").style.display = "block";
  player = new YT.Player("player", {
    width: "100%",
    height: "100%",
    playerVars: { playsinline: 1, origin: location.origin },
    events: { onReady, onStateChange, onError },
  });
});

function onReady() {
  playerPronto = true;
  socket.emit("pedirEstado");
}

function onStateChange(e) {
  if (e.data === YT.PlayerState.ENDED) {
    if (itemAtual !== null) socket.emit("terminou", itemAtual);
    return;
  }
  if (Date.now() < ignorarAte) return;
  const tempo = player.getCurrentTime();
  if (e.data === YT.PlayerState.PLAYING) socket.emit("tocar", tempo);
  if (e.data === YT.PlayerState.PAUSED) socket.emit("pausar", tempo);
}

function onError(e) {
  const msgs = {
    2: "Link de vídeo inválido.",
    100: "Vídeo não encontrado ou privado.",
    101: "Esse vídeo não permite ser tocado em outros sites.",
    150: "Esse vídeo não permite ser tocado em outros sites.",
    153: "O YouTube recusou a origem do player (erro 153).",
  };
  const base = msgs[e.data] || `Erro do player (${e.data}).`;
  if ([2, 100, 101, 150].includes(e.data) && itemAtual !== null) {
    avisoEl.textContent = base + " Pulando para o próximo.";
    socket.emit("pular", itemAtual);
  } else {
    avisoEl.textContent = base;
  }
}

socket.on("estado", (s) => {
  if (!playerPronto) return;
  ignorarAte = Date.now() + 1500;

  if (s.itemId === null) {
    itemAtual = null;
    player.stopVideo();
    return;
  }
  if (s.itemId !== itemAtual) {
    itemAtual = s.itemId;
    const opcoes = { videoId: s.videoId, startSeconds: s.position };
    s.playing ? player.loadVideoById(opcoes) : player.cueVideoById(opcoes);
    return;
  }
  if (Math.abs(player.getCurrentTime() - s.position) > 1.5) {
    player.seekTo(s.position, true);
  }
  s.playing ? player.playVideo() : player.pauseVideo();
});

socket.on("fila", ({ atual, fila }) => {
  agoraEl.textContent = atual
    ? `▶ ${atual.titulo} — por ${atual.nick}`
    : "Nada tocando. Adicione um link!";
  filaEl.replaceChildren();
  fila.forEach((item) => {
    const li = document.createElement("li");
    const texto = document.createElement("span");
    texto.textContent = `${item.titulo} — por ${item.nick}`;
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.setAttribute("aria-label", `Remover ${item.titulo}`);
    btn.addEventListener("click", () => socket.emit("remover", item.id));
    li.append(texto, btn);
    filaEl.appendChild(li);
  });
});

socket.on("aviso", (msg) => (avisoEl.textContent = msg));

function adicionar() {
  const texto = linkEl.value;
  const id = extrairId(texto);
  if (!id) {
    avisoEl.textContent = temLista(texto)
      ? "Playlists chegam no próximo passo 😉 Por enquanto, cole o link de um vídeo."
      : "Cole um link válido do YouTube.";
    return;
  }
  avisoEl.textContent = "";
  linkEl.value = "";
  socket.emit("adicionar", id);
}

document.getElementById("adicionar").addEventListener("click", adicionar);
linkEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") adicionar();
});
document.getElementById("pular").addEventListener("click", () => {
  if (itemAtual !== null) socket.emit("pular", itemAtual);
});