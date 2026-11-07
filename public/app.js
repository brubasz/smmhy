const socket = io({ autoConnect: false });
const statusEl = document.getElementById("status");
const avisoEl = document.getElementById("aviso");
const agoraEl = document.getElementById("agora");
const filaEl = document.getElementById("fila");
const linkEl = document.getElementById("link");
const authEl = document.getElementById("auth");
const usuarioEl = document.getElementById("usuario");
const entrarEl = document.getElementById("entrar");
const salaEl = document.getElementById("sala");
const saudacaoEl = document.getElementById("saudacao");
const erroAuthEl = document.getElementById("erroAuth");
const tituloAuthEl = document.getElementById("tituloAuth");
const campoNickEl = document.getElementById("campoNick");
const enviarAuthEl = document.getElementById("enviarAuth");
const trocarAuthEl = document.getElementById("trocarAuth");
const emailEl = document.getElementById("email");
const nickEl = document.getElementById("nick");
const senhaEl = document.getElementById("senha");

let player = null;
let playerPronto = false;
let itemAtual = null;
let ignorarAte = 0;
let modoCadastro = false;

async function chamarApi(caminho, metodo, corpo) {
  try {
    const r = await fetch(caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await r.json().catch(() => ({}));
    return { ok: r.ok, dados };
  } catch {
    return { ok: false, dados: { erro: "Não consegui falar com o servidor." } };
  }
}

function mostrarAuth() {
  statusEl.textContent = "Entre ou crie uma conta para usar a sala.";
  authEl.style.display = "block";
  usuarioEl.style.display = "none";
  entrarEl.style.display = "none";
  salaEl.style.display = "none";
}

function mostrarLogado(nick) {
  authEl.style.display = "none";
  usuarioEl.style.display = "flex";
  entrarEl.style.display = "inline-block";
  saudacaoEl.textContent = `Olá, ${nick}!`;
  if (!socket.connected) socket.connect();
}

function ajustarModo() {
  tituloAuthEl.textContent = modoCadastro ? "Criar conta" : "Entrar";
  enviarAuthEl.textContent = modoCadastro ? "Criar conta" : "Entrar";
  trocarAuthEl.textContent = modoCadastro ? "Já tenho conta" : "Criar uma conta";
  campoNickEl.style.display = modoCadastro ? "block" : "none";
  nickEl.required = modoCadastro;
  senhaEl.autocomplete = modoCadastro ? "new-password" : "current-password";
  erroAuthEl.textContent = "";
}

trocarAuthEl.addEventListener("click", () => {
  modoCadastro = !modoCadastro;
  ajustarModo();
});

document.getElementById("formAuth").addEventListener("submit", async (e) => {
  e.preventDefault();
  erroAuthEl.textContent = "";
  enviarAuthEl.disabled = true;
  const corpo = { email: emailEl.value, senha: senhaEl.value };
  if (modoCadastro) corpo.nick = nickEl.value;
  const { ok, dados } = await chamarApi(
    modoCadastro ? "/api/cadastro" : "/api/login",
    "POST",
    corpo
  );
  enviarAuthEl.disabled = false;
  if (!ok) {
    erroAuthEl.textContent = dados.erro || "Algo deu errado.";
    return;
  }
  senhaEl.value = "";
  mostrarLogado(dados.nick);
});

document.getElementById("sair").addEventListener("click", async () => {
  await chamarApi("/api/sair", "POST");
  location.reload();
});

socket.on("connect", () => {
  statusEl.textContent = "Conectado ao servidor ✅";
  if (playerPronto) socket.emit("pedirEstado");
});
socket.on("disconnect", () => (statusEl.textContent = "Desconectado ❌"));
socket.on("connect_error", (err) => {
  if (err.message === "nao_autenticado") mostrarAuth();
  else statusEl.textContent = "Não consegui conectar ao servidor.";
});

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

function extrairLista(texto) {
  try {
    const u = new URL(texto.trim());
    if (!u.hostname.endsWith("youtube.com")) return null;
    const lista = u.searchParams.get("list");
    if (lista && /^[\w-]{10,80}$/.test(lista) && !lista.startsWith("RD")) return lista;
  } catch {}
  return null;
}

entrarEl.addEventListener("click", () => {
  if (typeof YT === "undefined" || !YT.Player) {
    statusEl.textContent = "Carregando o player... tente de novo em um instante.";
    return;
  }
  entrarEl.style.display = "none";
  salaEl.style.display = "block";
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
  const lista = extrairLista(texto);
  const id = extrairId(texto);
  if (!lista && !id) {
    avisoEl.textContent = "Cole um link válido do YouTube.";
    return;
  }
  avisoEl.textContent = "";
  linkEl.value = "";
  if (lista) socket.emit("adicionarPlaylist", lista);
  else socket.emit("adicionar", id);
}

document.getElementById("adicionar").addEventListener("click", adicionar);
linkEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") adicionar();
});
document.getElementById("pular").addEventListener("click", () => {
  if (itemAtual !== null) socket.emit("pular", itemAtual);
});

ajustarModo();
(async () => {
  const { ok, dados } = await chamarApi("/api/eu", "GET");
  if (ok) mostrarLogado(dados.nick);
  else mostrarAuth();
})();