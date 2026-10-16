import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/modules/auth/session";
import { assertCaixinhaAccess, createCaixinha, listCaixinhasForUser } from "@/modules/caixinhas/service";
import { listCycles } from "@/modules/cycles/queries";
import { createCycle } from "@/modules/cycles/service";

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("caixinhas (integração)", () => {
  let admin: CurrentUser;
  let participant: CurrentUser;

  beforeAll(async () => {
    const adminId = randomUUID();
    const participantId = randomUUID();
    await db.user.createMany({
      data: [
        { id: adminId, name: "Admin dos Grupos", email: `${adminId.slice(0, 8)}@caixinhas.local`, role: "ADMIN" },
        {
          id: participantId,
          name: "Participante dos Grupos",
          email: `${participantId.slice(0, 8)}@caixinhas.local`,
          role: "PARTICIPANT",
        },
      ],
    });
    admin = {
      userId: adminId,
      name: "Admin dos Grupos",
      email: "",
      role: "ADMIN",
      status: "ACTIVE",
      participantId: null,
    };
    participant = {
      userId: participantId,
      name: "Participante dos Grupos",
      email: "",
      role: "PARTICIPANT",
      status: "ACTIVE",
      participantId: null,
    };
  });

  it("cria grupos separados, lista somente os acessíveis e isola os ciclos", async () => {
    const amigos = await createCaixinha(admin, { name: "Amigos do Bairro", description: "Grupo principal" });
    const viagem = await createCaixinha(admin, { name: "Viagem da Turma", description: null });

    await db.participant.create({
      data: {
        fullName: "Pessoa do primeiro grupo",
        email: `${randomUUID().slice(0, 8)}@participante.local`,
        joinedAt: new Date("2026-10-01T00:00:00Z"),
        caixinhaId: amigos.id,
      },
    });

    const cycleInput = {
      startDate: "2026-10-01",
      contributionEndDate: "2027-09-30",
      settlementDate: "2027-10-15",
      dueDay: 10,
      adminFeePercent: 1000,
      quotaValues: [5_000],
      rulesText: "",
    };
    await createCycle({ ...admin, caixinhaId: amigos.id }, { ...cycleInput, name: "Ciclo dos Amigos" });
    await createCycle({ ...admin, caixinhaId: viagem.id }, { ...cycleInput, name: "Ciclo da Viagem" });

    const memberships = await listCaixinhasForUser(admin.userId);
    expect(memberships).toHaveLength(2);
    expect(memberships.map((item) => item.role)).toEqual(["OWNER", "OWNER"]);
    expect(memberships.find((item) => item.caixinha.id === amigos.id)?.caixinha._count).toMatchObject({
      participants: 1,
      cycles: 1,
    });
    expect(await listCycles(amigos.id)).toMatchObject([{ name: "Ciclo dos Amigos" }]);
    expect(await listCycles(viagem.id)).toMatchObject([{ name: "Ciclo da Viagem" }]);
    await expect(assertCaixinhaAccess(participant.userId, amigos.id)).rejects.toThrow(DomainError);
  });

  it("permite que participante crie outro grupo e se torne responsável", async () => {
    const criada = await createCaixinha(participant, { name: "Grupo da Participante", description: null });
    const membership = await db.caixinhaMember.findUniqueOrThrow({
      where: { caixinhaId_userId: { caixinhaId: criada.id, userId: participant.userId } },
    });
    expect(membership.role).toBe("OWNER");
    await expect(assertCaixinhaAccess(participant.userId, criada.id)).resolves.toMatchObject({ role: "OWNER" });
  });
});
