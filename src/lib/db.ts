import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "@/lib/env";

function createClient() {
  // `?schema=` (usado nos testes) é tratado pelo adaptador, não pelo driver pg.
  const url = new URL(env.DATABASE_URL);
  const schema = url.searchParams.get("schema") ?? undefined;
  url.searchParams.delete("schema");

  const adapter = new PrismaPg({ connectionString: url.toString() }, schema ? { schema } : undefined);
  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["error", "warn"],
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });
}

// Reaproveita o cliente entre recarregamentos do servidor de desenvolvimento.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (!isProduction) globalForPrisma.prisma = db;

export type DbClient = typeof db;
/** Cliente dentro de `db.$transaction(async (tx) => ...)`. */
export type DbTransaction = Parameters<Parameters<DbClient["$transaction"]>[0]>[0];

/**
 * Serializa operações financeiras de um mesmo ciclo dentro da transação atual
 * (trava liberada automaticamente no COMMIT/ROLLBACK).
 */
export async function lockCycle(tx: DbTransaction, cycleId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${cycleId}))) AS l`;
}
