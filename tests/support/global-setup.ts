/**
 * Prepara o banco de TESTES: aplica migrations pendentes e esvazia todas as tabelas.
 * Roda uma vez por execução do Vitest. Nunca toca no banco de desenvolvimento.
 *
 * TRUNCATE (em vez de recriar o schema) é mais leve para o Postgres embutido local
 * e não dispara os gatilhos de linha que protegem tabelas append-only.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";

const KEEP = new Set(["_prisma_migrations", "feature_flag"]);

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return; // sem banco de testes: testes de integração são pulados
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL não pode ser igual a DATABASE_URL.");
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url, SHADOW_DATABASE_URL: "" },
    stdio: "pipe",
  });

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const tables = rows.map((r) => r.tablename).filter((t) => !KEEP.has(t));
    if (tables.length > 0) {
      await client.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    }
    await client.query("UPDATE feature_flag SET enabled = false");
  } finally {
    await client.end();
  }
}
