/** Dados FICTÍCIOS do E2E: administradora, João (participante) e um ciclo aberto. */
import { createScriptDb, upsertUserWithPassword } from "../scripts/lib/script-db";
import type { CurrentUser } from "../src/modules/auth/session";
import { addMembership, createCycle, openCycle, publishRules } from "../src/modules/cycles/service";

async function main() {
  const password = process.env.E2E_PASSWORD;
  if (!password) throw new Error("E2E_PASSWORD ausente.");
  const db = createScriptDb();
  try {
    const { user: admin } = await upsertUserWithPassword(db, {
      name: "Ana E2E",
      email: "admin.e2e@caixinha.local",
      role: "ADMIN",
      password,
    });
    const { user: joao } = await upsertUserWithPassword(db, {
      name: "João E2E",
      email: "joao.e2e@caixinha.local",
      role: "PARTICIPANT",
      password,
    });
    const caixinha = await db.caixinha.create({
      data: {
        name: "Caixinha dos Amigos",
        slug: "caixinha-dos-amigos-e2e",
        description: "Grupo fictício dos testes ponta a ponta.",
        ownerId: admin.id,
        members: {
          create: [
            { userId: admin.id, role: "OWNER" },
            { userId: joao.id, role: "PARTICIPANT" },
          ],
        },
      },
    });
    const participant = await db.participant.create({
      data: {
        fullName: "João E2E",
        email: joao.email,
        joinedAt: new Date("2026-10-01T00:00:00Z"),
        userId: joao.id,
        caixinhaId: caixinha.id,
      },
    });
    const actor: CurrentUser = {
      userId: admin.id,
      name: admin.name,
      email: admin.email,
      role: "ADMIN",
      status: "ACTIVE",
      participantId: null,
      caixinhaId: caixinha.id,
      caixinhaName: caixinha.name,
      caixinhaRole: "OWNER",
    };
    const cycle = await createCycle(actor, {
      name: "Ciclo E2E",
      startDate: "2026-10-01",
      contributionEndDate: "2027-09-30",
      settlementDate: "2027-10-15",
      dueDay: 10,
      adminFeePercent: 1000,
      quotaValues: [5_000, 10_000],
      rulesText: "",
    });
    await addMembership(actor, cycle.id, {
      participantId: participant.id,
      quotaCount: 2,
      quotaValueCents: 5_000,
      joinedAt: "2026-10-01",
    });
    await publishRules(actor, cycle.id);
    await openCycle(actor, cycle.id);
    console.log("[e2e] banco preparado: ciclo aberto com 1 participante.");
  } finally {
    await db.$disconnect();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
