/**
 * Seed de DEMONSTRAÇÃO — somente desenvolvimento.
 * Todos os dados são FICTÍCIOS (domínio .local, sem telefones reais).
 * A senha dos usuários de demonstração vem de DEV_SEED_PASSWORD no .env.
 */
import { createScriptDb, upsertUserWithPassword } from "../scripts/lib/script-db";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed de demonstração não pode ser executado em produção.");
  }
  const password = process.env.DEV_SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("Defina DEV_SEED_PASSWORD (mín. 10 caracteres) no .env para criar os usuários de demonstração.");
  }

  const db = createScriptDb();
  try {
    const { user: admin, created: adminCreated } = await upsertUserWithPassword(db, {
      name: "Ana Administradora",
      email: "admin@caixinha.local",
      role: "ADMIN",
      password,
    });

    const { user: joao } = await upsertUserWithPassword(db, {
      name: "João Exemplo",
      email: "joao@caixinha.local",
      role: "PARTICIPANT",
      password,
    });

    const caixinha = await db.caixinha.upsert({
      where: { slug: "caixinha-dos-amigos" },
      update: {},
      create: {
        name: "Caixinha dos Amigos",
        slug: "caixinha-dos-amigos",
        description: "Grupo fictício de demonstração.",
        ownerId: admin.id,
      },
    });
    await db.caixinhaMember.upsert({
      where: { caixinhaId_userId: { caixinhaId: caixinha.id, userId: admin.id } },
      update: { role: "OWNER" },
      create: { caixinhaId: caixinha.id, userId: admin.id, role: "OWNER" },
    });
    await db.caixinhaMember.upsert({
      where: { caixinhaId_userId: { caixinhaId: caixinha.id, userId: joao.id } },
      update: { role: "PARTICIPANT" },
      create: { caixinhaId: caixinha.id, userId: joao.id, role: "PARTICIPANT" },
    });

    await db.participant.upsert({
      where: { email: "joao@caixinha.local" },
      update: { caixinhaId: caixinha.id },
      create: {
        fullName: "João Exemplo",
        email: "joao@caixinha.local",
        joinedAt: new Date("2026-12-01"),
        userId: joao.id,
        caixinhaId: caixinha.id,
      },
    });

    if (adminCreated) {
      await db.auditLog.create({
        data: {
          actorId: admin.id,
          action: "seed.demo",
          entityType: "System",
          reason: "Usuários fictícios de demonstração criados pelo seed.",
        },
      });
    }

    console.log("Seed concluído:");
    console.log("  admin@caixinha.local  (Administrador)");
    console.log("  joao@caixinha.local   (Participante)");
    console.log("  Senha: valor de DEV_SEED_PASSWORD no arquivo .env");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
