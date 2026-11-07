require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function iniciar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      nick TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      foto BYTEA,
      foto_tipo TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS usuarios_nick_unico ON usuarios (LOWER(nick))"
  );
}

module.exports = { pool, iniciar };