/**
 * PostgreSQL LOCAL para desenvolvimento e testes — sem instalação e sem Docker.
 * Usa os binários oficiais do PostgreSQL 17 distribuídos pelo pacote `embedded-postgres`.
 *
 *   npm run db:start    inicializa (1ª vez), liga o servidor e cria os bancos
 *   npm run db:stop     desliga o servidor
 *   npm run db:status   mostra se está ligado
 *
 * Dados em ./.postgres (fora do git). Escuta somente em localhost.
 * Configuração no .env: LOCAL_PG_PORT, LOCAL_PG_USER, LOCAL_PG_PASSWORD.
 */
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE_DIR = path.join(ROOT, ".postgres");
const DATA_DIR = path.join(BASE_DIR, "data");
const LOG_FILE = path.join(BASE_DIR, "postgres.log");
const PORT = Number(process.env.LOCAL_PG_PORT || 5433);
const USER = process.env.LOCAL_PG_USER || "caixinha";
const PASSWORD = process.env.LOCAL_PG_PASSWORD;
const DATABASES = ["caixinha_dev", "caixinha_test"];

async function binaries() {
  const platform = `${process.platform}-${process.arch}`;
  const pkg = {
    "win32-x64": "@embedded-postgres/windows-x64",
    "darwin-arm64": "@embedded-postgres/darwin-arm64",
    "darwin-x64": "@embedded-postgres/darwin-x64",
    "linux-x64": "@embedded-postgres/linux-x64",
    "linux-arm64": "@embedded-postgres/linux-arm64",
  }[platform];
  if (!pkg) throw new Error(`Plataforma não suportada: ${platform}. Use o docker-compose.yml.`);
  return import(pkg);
}

function run(bin, args, { allowFail = false } = {}) {
  const r = spawnSync(bin, args, { encoding: "utf8", windowsHide: true });
  if (r.status !== 0 && !allowFail) {
    throw new Error(`${path.basename(bin)} falhou:\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  }
  return r;
}

async function canConnect() {
  const client = new pg.Client({
    host: "localhost",
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres",
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Liga o servidor SEM esperar o pg_ctl: no Windows o processo do banco herda os
 * canais do pai e uma espera síncrona nunca termina. A prontidão é verificada
 * tentando conectar. Erros de inicialização ficam em .postgres/postgres.log.
 */
async function launchServer(bin) {
  const child = spawn(bin.pg_ctl, ["start", "-D", DATA_DIR, "-l", LOG_FILE], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(1000);
    if (await canConnect()) return;
  }
  throw new Error(`O PostgreSQL não respondeu em 60 s. Veja ${path.relative(ROOT, LOG_FILE)}.`);
}

async function initialise(bin) {
  if (existsSync(path.join(DATA_DIR, "PG_VERSION"))) return false;
  if (!PASSWORD || PASSWORD.length < 12) {
    throw new Error("Defina LOCAL_PG_PASSWORD (mín. 12 caracteres) no .env antes da primeira inicialização.");
  }
  mkdirSync(BASE_DIR, { recursive: true });
  const pwFile = path.join(BASE_DIR, ".pwfile");
  writeFileSync(pwFile, PASSWORD, { mode: 0o600 });
  try {
    run(bin.initdb, [
      "-D",
      DATA_DIR,
      "-U",
      USER,
      `--pwfile=${pwFile}`,
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
    ]);
  } finally {
    rmSync(pwFile, { force: true });
  }
  appendFileSync(
    path.join(DATA_DIR, "postgresql.conf"),
    `\n# Caixinha dos Amigos (desenvolvimento)\nlisten_addresses = 'localhost'\nport = ${PORT}\ntimezone = 'UTC'\n`,
  );
  return true;
}

function isRunning(bin) {
  return run(bin.pg_ctl, ["status", "-D", DATA_DIR], { allowFail: true }).status === 0;
}

async function ensureDatabases() {
  const client = new pg.Client({ host: "localhost", port: PORT, user: USER, password: PASSWORD, database: "postgres" });
  await client.connect();
  try {
    for (const name of DATABASES) {
      const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
      if (!rowCount) {
        await client.query(`CREATE DATABASE "${name}"`);
        console.log(`  banco criado: ${name}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function start() {
  const bin = await binaries();
  const created = await initialise(bin);
  if (created) console.log("PostgreSQL local inicializado em .postgres/");
  if (!isRunning(bin)) {
    await launchServer(bin);
  }
  await ensureDatabases();
  console.log(`PostgreSQL 17 ligado em localhost:${PORT} (bancos: ${DATABASES.join(", ")}).`);
}

async function stop() {
  const bin = await binaries();
  if (!existsSync(DATA_DIR) || !isRunning(bin)) {
    console.log("PostgreSQL local já está desligado.");
    return;
  }
  run(bin.pg_ctl, ["stop", "-D", DATA_DIR, "-m", "fast", "-w"]);
  console.log("PostgreSQL local desligado.");
}

async function status() {
  const bin = await binaries();
  const on = existsSync(DATA_DIR) && isRunning(bin);
  console.log(on ? `Ligado em localhost:${PORT}.` : "Desligado.");
  process.exitCode = on ? 0 : 3;
}

const commands = { start, stop, status };
const command = process.argv[2];
if (!commands[command]) {
  console.error("Uso: node scripts/local-postgres.mjs <start|stop|status>");
  process.exit(1);
}
commands[command]().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
