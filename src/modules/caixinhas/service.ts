import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/audit";
import type { CurrentUser } from "@/modules/auth/session";
import type { CaixinhaInput } from "./schemas";

function slugBase(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52);
  return slug || "caixinha";
}

async function availableSlug(name: string) {
  const base = slugBase(name);
  const exists = await db.caixinha.findUnique({ where: { slug: base }, select: { id: true } });
  return exists ? `${base}-${randomBytes(3).toString("hex")}` : base;
}

export async function createCaixinha(actor: CurrentUser, input: CaixinhaInput) {
  const slug = await availableSlug(input.name);

  return db.$transaction(async (tx) => {
    const caixinha = await tx.caixinha.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        ownerId: actor.userId,
        members: { create: { userId: actor.userId, role: "OWNER" } },
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "caixinha.create",
        entityType: "Caixinha",
        entityId: caixinha.id,
        after: { name: caixinha.name, slug: caixinha.slug, description: caixinha.description },
      },
      tx,
    );
    return caixinha;
  });
}

export async function listCaixinhasForUser(userId: string) {
  return db.caixinhaMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      caixinha: {
        include: { _count: { select: { participants: true, cycles: true } } },
      },
    },
  });
}

export async function assertCaixinhaAccess(userId: string, caixinhaId: string) {
  const membership = await db.caixinhaMember.findUnique({
    where: { caixinhaId_userId: { caixinhaId, userId } },
    select: { role: true, caixinha: { select: { status: true } } },
  });
  if (!membership || membership.caixinha.status !== "ACTIVE") {
    throw new DomainError("Você não tem acesso a esta caixinha.");
  }
  return membership;
}

