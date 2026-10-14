/**
 * Recuperação de acesso: remove a verificação em duas etapas de um usuário que perdeu o celular
 * E os códigos de recuperação. Exige acesso ao servidor/banco (não existe pela interface).
 *
 *   npm run admin:reset-2fa -- --email pessoa@exemplo.com --reason "Celular roubado; identidade confirmada por vídeo"
 *
 * Todas as sessões do usuário são encerradas. Administradores precisarão configurar o 2FA
 * de novo no próximo acesso (obrigatório). A operação fica na auditoria.
 */
import { parseArgs } from "node:util";
import { createScriptDb } from "./lib/script-db";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, reason: { type: "string" } },
  });
  const email = values.email?.trim().toLowerCase();
  const reason = values.reason?.trim();
  if (!email || !reason || reason.length < 10) {
    console.error('Uso: npm run admin:reset-2fa -- --email pessoa@exemplo.com --reason "motivo (mín. 10 caracteres)"');
    process.exit(1);
  }

  const db = createScriptDb();
  try {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, twoFactorEnabled: true } });
    if (!user) {
      console.error(`Nenhum usuário com o e-mail ${email}.`);
      process.exit(1);
    }
    await db.$transaction(async (tx) => {
      await tx.twoFactor.deleteMany({ where: { userId: user.id } });
      await tx.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "auth.2fa_reset",
          entityType: "User",
          entityId: user.id,
          before: { twoFactorEnabled: user.twoFactorEnabled },
          after: { twoFactorEnabled: false },
          reason: `Via CLI: ${reason}`,
        },
      });
    });
    console.log(`Verificação em duas etapas removida para ${email}. Sessões encerradas.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
