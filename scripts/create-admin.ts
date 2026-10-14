/**
 * Cria o primeiro administrador (produção ou desenvolvimento).
 *
 *   npm run admin:create -- --email voce@exemplo.com --name "Seu Nome"
 *
 * A conta é criada com uma senha aleatória que NINGUÉM conhece. Em seguida, use
 * "Esqueci minha senha" na tela de login para definir a sua senha pelo e-mail.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createScriptDb, upsertUserWithPassword } from "./lib/script-db";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    console.error('Uso: npm run admin:create -- --email voce@exemplo.com --name "Seu Nome"');
    process.exit(1);
  }

  const db = createScriptDb();
  try {
    const { user, created } = await upsertUserWithPassword(db, {
      name,
      email,
      role: "ADMIN",
      password: randomBytes(32).toString("base64url"),
    });
    if (!created) {
      console.log(`Já existe um usuário com o e-mail ${email}. Nada foi alterado.`);
      return;
    }
    await db.auditLog.create({
      data: { actorId: null, action: "admin.create", entityType: "User", entityId: user.id, reason: "Criado via CLI" },
    });
    console.log(`Administrador criado: ${email}`);
    console.log('Próximo passo: na tela de login, clique em "Esqueci minha senha" para definir sua senha.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
