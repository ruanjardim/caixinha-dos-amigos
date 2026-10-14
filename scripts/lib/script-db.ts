/**
 * Utilitários para scripts de linha de comando (seed, criação de admin).
 * Não importa módulos "server-only" da aplicação.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role } from "../../src/generated/prisma/client";

export function createScriptDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida no .env");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** Mesmos parâmetros de src/lib/password.ts (argon2id). */
export function hashPassword(password: string) {
  return hash(password, { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

export async function upsertUserWithPassword(
  db: PrismaClient,
  input: { name: string; email: string; role: Role; password: string },
) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { user: existing, created: false };

  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: {
      id,
      name: input.name,
      email,
      emailVerified: true,
      role: input.role,
      accounts: {
        create: { id: randomUUID(), accountId: id, providerId: "credential", password: passwordHash },
      },
    },
  });
  return { user, created: true };
}
