import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "@/lib/env";

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["error", "warn"],
  });
}

// Reaproveita o cliente entre recarregamentos do servidor de desenvolvimento.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (!isProduction) globalForPrisma.prisma = db;

export type DbClient = typeof db;
/** Cliente dentro de `db.$transaction(async (tx) => ...)`. */
export type DbTransaction = Parameters<Parameters<DbClient["$transaction"]>[0]>[0];
