export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** Banco exclusivo dos testes E2E: E2E_DATABASE_URL ou o servidor de TEST_DATABASE_URL com o banco caixinha_e2e. */
export function e2eDatabaseUrl(): string {
  const explicit = process.env.E2E_DATABASE_URL;
  const base = explicit ?? process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("Defina E2E_DATABASE_URL ou TEST_DATABASE_URL para os testes E2E.");
  const url = new URL(base);
  if (!explicit) url.pathname = "/caixinha_e2e";
  for (const other of [process.env.DATABASE_URL, process.env.DATABASE_URL_ORIGINAL]) {
    if (!other) continue;
    const o = new URL(other);
    if (o.host === url.host && o.pathname === url.pathname) {
      throw new Error("O banco E2E não pode ser o banco de desenvolvimento.");
    }
  }
  return url.toString();
}
