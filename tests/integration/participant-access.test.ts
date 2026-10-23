import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { auth } from "@/modules/auth/auth";
import { ForbiddenError, type CurrentUser } from "@/modules/auth/session";
import { grantAccess, suspendAccess } from "@/modules/participants/service";

// Exercita o banco real de testes, sem enviar e-mails ou redefinir senhas reais.
vi.mock("@/modules/auth/auth", () => ({
  auth: { api: { requestPasswordReset: vi.fn().mockResolvedValue({ status: true }) } },
}));

const enabled = Boolean(process.env.DATABASE_URL);
const sendLink = vi.mocked(auth.api.requestPasswordReset);

async function user(overrides: { role?: "ADMIN" | "PARTICIPANT"; twoFactorEnabled?: boolean } = {}) {
  const id = randomUUID();
  return db.user.create({
    data: {
      id,
      name: "Pessoa dos convites",
      email: `${id}@convites.local`,
      twoFactorEnabled: true,
      ...overrides,
    },
  });
}

async function group() {
  const owner = await user();
  const caixinha = await db.caixinha.create({
    data: {
      name: "Grupo dos convites",
      slug: randomUUID(),
      ownerId: owner.id,
      members: { create: { userId: owner.id, role: "OWNER" } },
    },
  });
  const actor: CurrentUser = {
    userId: owner.id,
    name: owner.name,
    email: owner.email,
    role: owner.role,
    status: "ACTIVE",
    participantId: null,
    caixinhaId: caixinha.id,
    caixinhaRole: "OWNER",
    twoFactorEnabled: true,
    twoFactorPending: false,
  };
  return { owner, caixinha, actor };
}

async function participant(caixinhaId: string, userId?: string, email?: string) {
  return db.participant.create({
    data: {
      caixinhaId,
      fullName: "Convidado do Grupo",
      email: email ?? `${randomUUID()}@convites.local`,
      joinedAt: new Date("2026-10-01T00:00:00Z"),
      userId,
    },
  });
}

async function accessCounts() {
  const [users, accounts, members, audits] = await Promise.all([
    db.user.count(),
    db.account.count(),
    db.caixinhaMember.count(),
    db.auditLog.count(),
  ]);
  return { users, accounts, members, audits };
}

describe.skipIf(!enabled)("convites exclusivos da administração (integração)", () => {
  beforeEach(() => sendLink.mockClear());

  it("responsável com papel global de participante convida somente para seu grupo", async () => {
    const { actor, caixinha } = await group();
    const p = await participant(caixinha.id);
    const financialBefore = await Promise.all([db.payment.count(), db.installment.count(), db.ledgerLine.count()]);

    await grantAccess(actor, p.id);

    const linked = await db.participant.findUniqueOrThrow({ where: { id: p.id }, include: { user: true } });
    expect(linked.user).toMatchObject({ role: "PARTICIPANT", status: "ACTIVE", email: p.email });
    expect(
      await db.caixinhaMember.findUniqueOrThrow({
        where: { caixinhaId_userId: { caixinhaId: caixinha.id, userId: linked.userId! } },
      }),
    ).toMatchObject({ role: "PARTICIPANT" });
    expect(sendLink).toHaveBeenCalledTimes(1);
    expect(sendLink.mock.calls[0][0]?.body.email).toBe(p.email);
    expect(await Promise.all([db.payment.count(), db.installment.count(), db.ledgerLine.count()])).toEqual(
      financialBefore,
    );
  });

  it("administrador local também pode enviar e reenviar sem duplicar o vínculo", async () => {
    const { actor, caixinha } = await group();
    await db.caixinhaMember.update({
      where: { caixinhaId_userId: { caixinhaId: caixinha.id, userId: actor.userId } },
      data: { role: "ADMIN" },
    });
    const p = await participant(caixinha.id);
    await grantAccess(actor, p.id);
    const before = await accessCounts();
    await grantAccess(actor, p.id);
    expect(await accessCounts()).toEqual({ ...before, audits: before.audits + 1 });
    expect(sendLink).toHaveBeenCalledTimes(2);
  });

  it("participante não convida nem passando um papel administrativo antigo ou forjado", async () => {
    const { actor, caixinha } = await group();
    await db.caixinhaMember.update({
      where: { caixinhaId_userId: { caixinhaId: caixinha.id, userId: actor.userId } },
      data: { role: "PARTICIPANT" },
    });
    const p = await participant(caixinha.id);
    const before = await accessCounts();
    await expect(grantAccess({ ...actor, role: "ADMIN", caixinhaRole: "OWNER" }, p.id)).rejects.toThrow(ForbiddenError);
    expect(await accessCounts()).toEqual(before);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("papel global de administrador não supera o papel de participante na caixinha", async () => {
    const { actor, caixinha } = await group();
    await db.user.update({ where: { id: actor.userId }, data: { role: "ADMIN" } });
    await db.caixinhaMember.update({
      where: { caixinhaId_userId: { caixinhaId: caixinha.id, userId: actor.userId } },
      data: { role: "PARTICIPANT" },
    });
    const p = await participant(caixinha.id);
    await expect(grantAccess(actor, p.id)).rejects.toThrow(ForbiddenError);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("nega outro grupo, com ou sem troca do identificador da caixinha", async () => {
    const first = await group();
    const second = await group();
    const p = await participant(second.caixinha.id);
    const before = await accessCounts();
    await expect(grantAccess(first.actor, p.id)).rejects.toThrow("Participante não encontrado.");
    await expect(grantAccess({ ...first.actor, caixinhaId: second.caixinha.id }, p.id)).rejects.toThrow(ForbiddenError);
    expect(await accessCounts()).toEqual(before);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("sem contexto de grupo não procura participantes de todas as caixinhas", async () => {
    const { actor, caixinha } = await group();
    await db.user.update({ where: { id: actor.userId }, data: { role: "ADMIN" } });
    const p = await participant(caixinha.id);
    await expect(grantAccess({ ...actor, caixinhaId: null, caixinhaRole: null }, p.id)).rejects.toThrow(
      "Participante não encontrado.",
    );
    expect(sendLink).not.toHaveBeenCalled();
  });

  it.each(["suspenso", "sem duas etapas", "grupo arquivado", "papel removido"])(
    "revalida no banco quando o administrador está %s",
    async (condition) => {
      const { actor, caixinha } = await group();
      const p = await participant(caixinha.id);
      if (condition === "suspenso")
        await db.user.update({ where: { id: actor.userId }, data: { status: "SUSPENDED" } });
      if (condition === "sem duas etapas")
        await db.user.update({ where: { id: actor.userId }, data: { twoFactorEnabled: false } });
      if (condition === "grupo arquivado")
        await db.caixinha.update({ where: { id: caixinha.id }, data: { status: "ARCHIVED" } });
      if (condition === "papel removido")
        await db.caixinhaMember.deleteMany({ where: { caixinhaId: caixinha.id, userId: actor.userId } });
      const before = await accessCounts();
      await expect(grantAccess(actor, p.id)).rejects.toThrow(ForbiddenError);
      expect(await accessCounts()).toEqual(before);
      expect(sendLink).not.toHaveBeenCalled();
    },
  );

  it.each([
    { role: "OWNER" as const, linked: true },
    { role: "ADMIN" as const, linked: true },
    { role: "OWNER" as const, linked: false },
    { role: "ADMIN" as const, linked: false },
  ])("reenvio preserva $role (cadastro já vinculado: $linked)", async ({ role, linked }) => {
    const { actor, caixinha } = await group();
    const existing = await user({ role: "ADMIN" });
    await db.caixinhaMember.create({ data: { caixinhaId: caixinha.id, userId: existing.id, role } });
    const p = await participant(caixinha.id, linked ? existing.id : undefined, existing.email);
    await grantAccess(actor, p.id);
    expect(
      await db.caixinhaMember.findUniqueOrThrow({
        where: { caixinhaId_userId: { caixinhaId: caixinha.id, userId: existing.id } },
      }),
    ).toMatchObject({ role });
    expect(sendLink).toHaveBeenCalledTimes(1);
  });

  it("cadastros inativos ou anonimizados não recebem convites", async () => {
    const { actor, caixinha } = await group();
    const p = await participant(caixinha.id);
    await db.participant.update({ where: { id: p.id }, data: { status: "INACTIVE" } });
    await expect(grantAccess(actor, p.id)).rejects.toThrow("Ative o cadastro");
    await db.participant.update({ where: { id: p.id }, data: { status: "ACTIVE", anonymizedAt: new Date() } });
    await expect(grantAccess(actor, p.id)).rejects.toThrow("anonimizado");
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("a suspensão também exige o administrador do grupo", async () => {
    const first = await group();
    const second = await group();
    const invited = await user();
    const p = await participant(second.caixinha.id, invited.id, invited.email);
    await expect(suspendAccess(first.actor, p.id, "Teste")).rejects.toThrow("não tem acesso");
    await expect(suspendAccess({ ...first.actor, caixinhaId: second.caixinha.id }, p.id, "Teste")).rejects.toThrow(
      ForbiddenError,
    );
    expect(await db.user.findUniqueOrThrow({ where: { id: invited.id } })).toMatchObject({ status: "ACTIVE" });
    await suspendAccess(second.actor, p.id, "Solicitado pela administração");
    expect(await db.user.findUniqueOrThrow({ where: { id: invited.id } })).toMatchObject({ status: "SUSPENDED" });
  });
});
