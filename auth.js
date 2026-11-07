const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
function lerCookies(cabecalho) {
  const cookies = {};
  String(cabecalho || "")
    .split(";")
    .forEach((par) => {
      const i = par.indexOf("=");
      if (i < 0) return;
      const nome = par.slice(0, i).trim();
      let valor = par.slice(i + 1).trim();
      if (!nome) return;
      try {
        valor = decodeURIComponent(valor);
      } catch {}
      cookies[nome] = valor;
    });
  return cookies;
}

function usuarioDoCabecalho(cabecalho) {
  return usuarioDoToken(lerCookies(cabecalho)[NOME_COOKIE]);
}
const rateLimit = require("express-rate-limit");
const { pool } = require("./db");

const NOME_COOKIE = "smmhy_sessao";
const EMAIL_VALIDO = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const NICK_VALIDO = /^[\p{L}\p{N}_.-]{3,20}$/u;

function segredo() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET ausente ou curto demais no .env");
  }
  return s;
}
segredo();

const HASH_FALSO = bcrypt.hashSync("senha-falsa-para-igualar-o-tempo", 12);

const opcoesCookie = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function enviarSessao(res, usuario) {
  const token = jwt.sign({ id: usuario.id }, segredo(), { expiresIn: "7d" });
  res.cookie(NOME_COOKIE, token, { ...opcoesCookie, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

async function usuarioDoToken(token) {
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, segredo(), { algorithms: ["HS256"] });
    const r = await pool.query("SELECT id, nick FROM usuarios WHERE id = $1", [id]);
    return r.rows[0] || null;
  } catch (e) {
    console.error("Falha ao validar sessão:", e.message);
    return null;
  }
}

function usuarioDoCabecalho(cabecalho) {
  const cookies = lerCookies(cabecalho);
  return usuarioDoToken(cookies[NOME_COOKIE]);
}

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas tentativas. Tente de novo em alguns minutos." },
});

const router = express.Router();

router.post("/cadastro", limitador, async (req, res) => {
  const corpo = req.body || {};
  const email = String(corpo.email || "").trim().toLowerCase();
  const nick = String(corpo.nick || "").trim();
  const senha = String(corpo.senha || "");

  if (!EMAIL_VALIDO.test(email)) {
    return res.status(400).json({ erro: "E-mail inválido." });
  }
  if (!NICK_VALIDO.test(nick)) {
    return res.status(400).json({ erro: "O nick deve ter de 3 a 20 caracteres (letras, números, _ . -)." });
  }
  if (senha.length < 8 || senha.length > 72) {
    return res.status(400).json({ erro: "A senha deve ter de 8 a 72 caracteres." });
  }

  try {
    const hash = await bcrypt.hash(senha, 12);
    const r = await pool.query(
      "INSERT INTO usuarios (email, nick, senha_hash) VALUES ($1, $2, $3) RETURNING id, nick",
      [email, nick, hash]
    );
    enviarSessao(res, r.rows[0]);
    res.status(201).json({ nick: r.rows[0].nick });
  } catch (e) {
    if (e.code === "23505") {
      const campo = String(e.constraint || "").includes("nick") ? "nick" : "e-mail";
      return res.status(409).json({ erro: `Esse ${campo} já está em uso.` });
    }
    console.error("Erro no cadastro:", e.code || e.message);
    res.status(500).json({ erro: "Erro ao criar a conta." });
  }
});

router.post("/login", limitador, async (req, res) => {
  const corpo = req.body || {};
  const email = String(corpo.email || "").trim().toLowerCase();
  const senha = String(corpo.senha || "");

  try {
    const r = await pool.query(
      "SELECT id, nick, senha_hash FROM usuarios WHERE email = $1",
      [email]
    );
    const usuario = r.rows[0];
    const ok = await bcrypt.compare(senha, usuario ? usuario.senha_hash : HASH_FALSO);
    if (!usuario || !ok) {
      return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }
    enviarSessao(res, usuario);
    res.json({ nick: usuario.nick });
  } catch (e) {
    console.error("Erro no login:", e.code || e.message);
    res.status(500).json({ erro: "Erro ao entrar." });
  }
});

router.post("/sair", (req, res) => {
  res.clearCookie(NOME_COOKIE, opcoesCookie);
  res.json({ ok: true });
});

router.get("/eu", async (req, res) => {
  const usuario = await usuarioDoCabecalho(req.headers.cookie);
  if (!usuario) return res.status(401).json({ erro: "Não autenticado." });
  res.json({ nick: usuario.nick });
});

module.exports = { router, usuarioDoCabecalho };