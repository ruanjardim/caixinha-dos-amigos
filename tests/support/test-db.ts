/**
 * Banco de testes: instância SEPARADA (TEST_DATABASE_URL), apagada a cada execução.
 *
 * Não usamos um schema separado no mesmo servidor porque o Postgres local embutido
 * (`prisma dev`/PGlite) compartilha configurações de sessão entre conexões —
 * um `search_path` de teste poderia afetar o banco de desenvolvimento.
 */
export function testDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return undefined;
  if (url === process.env.DATABASE_URL_ORIGINAL) {
    throw new Error("TEST_DATABASE_URL não pode ser igual ao banco de desenvolvimento.");
  }
  return url;
}
