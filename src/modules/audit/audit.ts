import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { db, type DbTransaction } from "@/lib/db";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

/** Campos que jamais podem ir para a trilha de auditoria. */
const SENSITIVE_KEYS = /pass(word)?|secret|token|hash|api[_-]?key|credential/i;

export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEYS.test(k) ? "[REMOVIDO]" : redact(v),
      ]),
    );
  }
  return value;
}

async function requestContext() {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return { ipAddress: ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch {
    // Fora de uma requisição (scripts, seed, testes).
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Registra uma entrada de auditoria. Passe `tx` para gravar na MESMA transação
 * da operação auditada — assim não existe operação sem registro.
 */
export async function recordAudit(entry: AuditEntry, tx?: DbTransaction): Promise<void> {
  const client = tx ?? db;
  const ctx = await requestContext();
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: (redact(entry.before) ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (redact(entry.after) ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: entry.reason ?? null,
      ...ctx,
    },
  });
}
