/**
 * Prepara o banco E2E: cria (se preciso), aplica migrations, esvazia e popula com dados FICTÍCIOS.
 * A senha dos usuários de teste é gerada a cada execução e gravada em e2e/.state (fora do git).
 */
import "dotenv/config";
import { execFileSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./env";

const KEEP = new Set(["_prisma_migrations", "feature_flag"]);

export default async function globalSetup() {
  const url = e2eDatabaseUrl();
  const dbName = new URL(url).pathname.slice(1).replace(/[^a-z0-9_]/gi, "");

  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";
  const maintenance = new Client({ connectionString: maintenanceUrl.toString() });
  await maintenance.connect();
  const exists = await maintenance.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await maintenance.query(`CREATE DATABASE "${dbName}"`);
  await maintenance.end();

  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });

  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  const tables = rows.map((r) => r.tablename).filter((t) => !KEEP.has(t));
  if (tables.length) {
    await client.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  await client.query("UPDATE feature_flag SET enabled = false");
  await client.end();

  const password = `E2e-${randomBytes(12).toString("base64url")}`;
  // Seed pelos serviços da aplicação; e2e/tsconfig.seed.json troca "server-only" por um módulo vazio.
  execFileSync(process.execPath, ["--import", "tsx", "e2e/seed.ts"], {
    env: { ...process.env, DATABASE_URL: url, E2E_PASSWORD: password, TSX_TSCONFIG_PATH: "e2e/tsconfig.seed.json" },
    stdio: "inherit",
  });

  const stateDir = path.join("e2e", ".state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    path.join(stateDir, "credentials.json"),
    JSON.stringify({ admin: "admin.e2e@caixinha.local", participant: "joao.e2e@caixinha.local", password }, null, 2),
  );
}
