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
const perfilEl = document.getElementById("perfil");
const saudacaoEl = document.getElementById("saudacao");
const avisoPerfilEl = document.getElementById("avisoPerfil");
const erroAuthEl = document.getElementById("erroAuth");
const tituloAuthEl = document.getElementById("tituloAuth");
const campoNickEl = document.getElementById("campoNick");
const campoFotoEl = document.getElementById("campoFoto");
const enviarAuthEl = document.getElementById("enviarAuth");
const trocarAuthEl = document.getElementById("trocarAuth");
const emailEl = document.getElementById("email");
const nickEl = document.getElementById("nick");
const senhaEl = document.getElementById("senha");
const fotoEl = document.getElementById("foto");
const trocarFotoEl = document.getElementById("trocarFoto");
const removerFotoEl = document.getElementById("removerFoto");

const LADO_FOTO = 512;
const MAX_ORIGINAL = 5 * 1024 * 1024;
const MAX_ENVIO = 250 * 1024;

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

function inicial(nick) {
  const el = document.createElement("span");
  el.className = "avatar";
  el.textContent = String(nick || "?").trim().charAt(0).toUpperCase();
  return el;
}

function criarAvatar(nick, userId, fotoV) {
  if (!fotoV) return inicial(nick);
  const img = document.createElement("img");
  img.className = "avatar";
  img.alt = "";
  img.src = `/api/foto/${userId}?v=${fotoV}`;
  img.addEventListener("error", () => img.replaceWith(inicial(nick)));
  return img;
}

function paraBlob(canvas, qualidade) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", qualidade));
}

function reduzirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo || !/^image\/(jpeg|png|webp)$/.test(arquivo.type)) {
      reject(new Error("Escolha uma imagem JPG, PNG ou WebP."));
      return;
    }
    if (arquivo.size > MAX_ORIGINAL) {
      reject(new Error("A imagem tem mais de 5 MB."));
      return;
    }
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const lado = Math.min(img.width, img.height);
      const alvo = Math.max(1, Math.min(lado, LADO_FOTO));
      const canvas = document.createElement("canvas");
      canvas.width = alvo;
      canvas.height = alvo;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, alvo, alvo);
      ctx.drawImage(
        img,
        (img.width - lado) / 2,
        (img.height - lado) / 2,
        lado,
        lado,
        0,
        0,
        alvo,
        alvo
      );
      for (const qualidade of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
        const blob = await paraBlob(canvas, qualidade);
        if (blob && blob.size <= MAX_ENVIO) {
          resolve(blob);
          return;
        }
      }
      reject(new Error("Não consegui deixar a imagem pequena o bastante."));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não consegui ler essa imagem."));
    };
    img.src = url;
  });
}

async function enviarFoto(arquivo) {
  const blob = await reduzirImagem(arquivo);
  const r = await fetch("/api/foto", {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!r.ok) {
    const dados = await r.json().catch(() => ({}));
    throw new Error(dados.erro || "Não consegui enviar a foto.");
  }
}

function mostrarAuth() {
  statusEl.textContent = "Entre ou crie uma conta para usar a sala.";
  authEl.style.display = "block";
  usuarioEl.style.display = "none";
  entrarEl.style.display = "none";
  salaEl.style.display = "none";
}

function mostrarLogado(u) {
  authEl.style.display = "none";
  usuarioEl.style.display = "flex";
  entrarEl.style.display = "inline-block";
  perfilEl.replaceChildren(criarAvatar(u.nick, u.id, u.fotoV));
  saudacaoEl.textContent = u.nick;
  removerFotoEl.style.display = u.fotoV ? "inline-block" : "none";
  if (!socket.connected) socket.connect();
}

function ajustarModo() {
  tituloAuthEl.textContent = modoCadastro ? "Criar conta" : "Entrar";
  enviarAuthEl.textContent = modoCadastro ? "Criar conta" : "Entrar";
  trocarAuthEl.textContent = modoCadastro ? "Já tenho conta" : "Criar uma conta";
  campoNickEl.style.display = modoCadastro ? "block" : "none";
  campoFotoEl.style.display = modoCadastro ? "block" : "none";
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
  const arquivo = modoCadastro ? fotoEl.files[0] : null;
  if (arquivo) {
    try {
      await enviarFoto(arquivo);
      location.reload();
      return;
    } catch (err) {
      avisoPerfilEl.textContent = `Conta criada, mas a foto não foi enviada: ${err.message}`;
    }
  }
  mostrarLogado(dados);
});

document.getElementById("trocarFotoBtn").addEventListener("click", () => trocarFotoEl.click());

trocarFotoEl.addEventListener("change", async () => {
  const arquivo = trocarFotoEl.files[0];
  if (!arquivo) return;
  avisoPerfilEl.textContent = "Enviando foto...";
  try {
    await enviarFoto(arquivo);
    location.reload();
  } catch (err) {
    avisoPerfilEl.textContent = err.message;
    trocarFotoEl.value = "";
  }
});

removerFotoEl.addEventListener("click", async () => {
  const { ok, dados } = await chamarApi("/api/foto", "DELETE");
  if (ok) location.reload();
  else avisoPerfilEl.textContent = dados.erro || "Não consegui remover a foto.";
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
  usuarioEl.classList.add("compacto");
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
  agoraEl.replaceChildren();
  if (atual) {
    const t = document.createElement("span");
    t.textContent = `▶ ${atual.titulo} — por ${atual.nick}`;
    agoraEl.append(criarAvatar(atual.nick, atual.userId, atual.fotoV), t);
  } else {
    agoraEl.textContent = "Nada tocando. Adicione um link!";
  }
  filaEl.replaceChildren();
  fila.forEach((item) => {
    const li = document.createElement("li");
    const info = document.createElement("span");
    info.className = "info";
    const texto = document.createElement("span");
    texto.textContent = `${item.titulo} — por ${item.nick}`;
    info.append(criarAvatar(item.nick, item.userId, item.fotoV), texto);
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.setAttribute("aria-label", `Remover ${item.titulo}`);
    btn.addEventListener("click", () => socket.emit("remover", item.id));
    li.append(info, btn);
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
  if (ok) mostrarLogado(dados);
  else mostrarAuth();
})();