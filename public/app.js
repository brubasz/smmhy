const socket = io();
const statusEl = document.getElementById("status");
const avisoEl = document.getElementById("aviso");

let player = null;
let playerPronto = false;
let videoAtual = null;
let ignorarAte = 0; 

socket.on("connect", () => (statusEl.textContent = "Conectado ao servidor ✅"));
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

document.getElementById("entrar").addEventListener("click", () => {
  document.getElementById("entrar").style.display = "none";
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
  avisoEl.textContent = msgs[e.data] || `Erro do player (${e.data}).`;
}

socket.on("estado", (s) => {
  if (!playerPronto || !s.videoId) return;
  avisoEl.textContent = "";
  ignorarAte = Date.now() + 1500;

  if (s.videoId !== videoAtual) {
    videoAtual = s.videoId;
    const opcoes = { videoId: s.videoId, startSeconds: s.position };
    s.playing ? player.loadVideoById(opcoes) : player.cueVideoById(opcoes);
    return;
  }
  if (Math.abs(player.getCurrentTime() - s.position) > 1.5) {
    player.seekTo(s.position, true);
  }
  s.playing ? player.playVideo() : player.pauseVideo();
});

document.getElementById("tocar").addEventListener("click", () => {
  const id = extrairId(document.getElementById("link").value);
  if (!id) {
    avisoEl.textContent = "Cole um link válido do YouTube.";
    return;
  }
  avisoEl.textContent = "";
  socket.emit("carregar", id);
});