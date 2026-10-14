/**
 * Backup completo: banco (pg_dump, formato custom) + comprovantes/imagens (tar.gz) + manifesto SHA-256,
 * seguido da retenção (7 diários, 4 semanais, 12 mensais).
 *
 *   npm run backup                 # banco + arquivos
 *   npm run backup -- --skip-db    # só arquivos (quando o provedor do banco já faz o backup dele)
 *   npm run backup -- --no-prune   # não apaga backups antigos
 *
 * Requer `pg_dump` (cliente PostgreSQL da MESMA versão principal do servidor) no PATH ou em PG_DUMP_PATH.
 * Pasta de destino: BACKUP_DIR (padrão ./backups). Os arquivos contêm dados pessoais e financeiros:
 * guarde cópia cifrada FORA do servidor (ver docs/backup.md).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { backupsToDelete } from "../src/domain/backup-retention";

const { values } = parseArgs({ options: { "skip-db": { type: "boolean" }, "no-prune": { type: "boolean" } } });
const dir = path.resolve(process.env.BACKUP_DIR || "backups");
const now = new Date();
const stamp = now.toISOString().slice(0, 16).replace("T", "_").replace(":", "");
const base = `caixinha_${stamp}`;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Credenciais vão por variáveis de ambiente do processo filho — nunca na linha de comando (visível em `ps`). */
function pgEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ""),
    ...(url.searchParams.get("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode")! } : {}),
  };
}

function sha256(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

mkdirSync(dir, { recursive: true });
const produced: string[] = [];

if (!values["skip-db"]) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL não definida.");
  const pgDump = process.env.PG_DUMP_PATH || "pg_dump";
  const probe = spawnSync(pgDump, ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    fail(
      `pg_dump não encontrado (${pgDump}). Instale o cliente PostgreSQL ou defina PG_DUMP_PATH. ` +
        "Se o banco já tem backup no provedor, use --skip-db.",
    );
  }
  const file = path.join(dir, `${base}.dump`);
  const r = spawnSync(pgDump, ["--format=custom", "--no-owner", "--no-privileges", `--file=${file}`], {
    env: pgEnv(databaseUrl),
    encoding: "utf8",
  });
  if (r.status !== 0) fail(`pg_dump falhou: ${r.stderr?.trim() || r.error?.message}`);
  produced.push(file);
  console.log(`✓ Banco: ${path.relative(process.cwd(), file)} (${probe.stdout.trim()})`);
}

const uploads = path.join("storage", "uploads");
if (existsSync(uploads)) {
  const file = path.join(dir, `${base}_arquivos.tar.gz`);
  // Nome relativo (cwd = pasta de backup): o tar GNU trataria "C:\..." como host remoto.
  const r = spawnSync("tar", ["-czf", path.basename(file), "-C", path.resolve("storage"), "uploads"], {
    cwd: dir,
    encoding: "utf8",
  });
  if (r.status !== 0) fail(`tar falhou: ${r.stderr?.trim() || r.error?.message}`);
  produced.push(file);
  console.log(`✓ Arquivos: ${path.relative(process.cwd(), file)}`);
} else {
  console.log("• Nenhum comprovante enviado ainda (storage/uploads não existe).");
}

if (produced.length === 0) fail("Nada foi gerado.");
const manifest = path.join(dir, `${base}.sha256`);
writeFileSync(manifest, produced.map((f) => `${sha256(f)}  ${path.basename(f)}`).join("\n") + "\n");
console.log(`✓ Manifesto: ${path.relative(process.cwd(), manifest)}`);

if (!values["no-prune"]) {
  // Um "backup" = todos os arquivos com o mesmo carimbo de data/hora.
  const sets = new Map<string, string[]>();
  for (const name of readdirSync(dir)) {
    const m = /^caixinha_(\d{4}-\d{2}-\d{2}_\d{4})/.exec(name);
    if (!m) continue;
    sets.set(m[1], [...(sets.get(m[1]) ?? []), name]);
  }
  const files = [...sets.keys()].map((s) => ({
    name: s,
    createdAt: new Date(`${s.slice(0, 10)}T${s.slice(11, 13)}:${s.slice(13, 15)}:00Z`),
  }));
  const remove = backupsToDelete(files, now);
  for (const set of remove) for (const name of sets.get(set.name) ?? []) rmSync(path.join(dir, name));
  console.log(`✓ Retenção: ${files.length - remove.length} backup(s) mantido(s), ${remove.length} removido(s).`);
}
