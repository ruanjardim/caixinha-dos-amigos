import "server-only";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { db, type DbTransaction } from "@/lib/db";
import { env } from "@/lib/env";
import { DomainError } from "@/lib/errors";
import { sendMail } from "@/lib/mailer";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";
import { recordAudit } from "@/modules/audit/audit";

const PREFIX = "authenticator-recovery:";
const VALIDITY_MS = 15 * 60 * 1000;
const INVALID_LINK = "Link inválido ou expirado. Solicite a recuperação novamente.";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function recoveryUser(client: Pick<DbTransaction, "user">, id: string) {
  return client.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      twoFactorEnabled: true,
      accounts: {
        where: { providerId: "credential" },
        orderBy: { id: "asc" },
        select: { id: true, password: true },
      },
      twoFactors: {
        orderBy: { id: "asc" },
        select: { id: true, secret: true, backupCodes: true, verified: true },
      },
    },
  });
}

type RecoveryUser = NonNullable<Awaited<ReturnType<typeof recoveryUser>>>;

function eligible(user: RecoveryUser | null): user is RecoveryUser {
  return Boolean(
    user?.status === "ACTIVE" &&
    user.twoFactorEnabled &&
    user.accounts.some((account) => account.password) &&
    user.twoFactors.some((factor) => factor.verified),
  );
}

/** Vincula a prova ao e-mail e às credenciais atuais; qualquer troca invalida o link. */
function proof(user: RecoveryUser, nonce: string, expiresAt: Date) {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(JSON.stringify([PREFIX, nonce, expiresAt.getTime(), user.id, user.email, user.accounts, user.twoFactors]))
    .digest("base64url");
}

async function lockRecovery(tx: DbTransaction, userId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${PREFIX + userId}))) AS l`;
}

/** Limite compartilhado entre instâncias, usando a tabela de autenticação já existente. */
export async function limitEmailRecovery(identity: string, maximum: number): Promise<void> {
  const key = PREFIX + digest(identity);
  const allowed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
    const current = await tx.rateLimit.findUnique({ where: { key } });
    const now = BigInt(Date.now());
    const active = current && current.lastRequest > now - BigInt(VALIDITY_MS);
    if (active && current.count >= maximum) return false;
    const data = { count: active ? current.count + 1 : 1, lastRequest: active ? current.lastRequest : now };
    await tx.rateLimit.upsert({ where: { key }, create: { id: randomUUID(), key, ...data }, update: data });
    return true;
  });
  if (!allowed) throw new DomainError("Muitas tentativas. Aguarde 15 minutos e tente novamente.", "RATE_LIMITED");
}

/** Executada após a resposta pública, inclusive para e-mails desconhecidos (sem enumeração por SMTP). */
export async function sendAuthenticatorRecovery(email: string): Promise<void> {
  let verificationId: string | undefined;
  try {
    const account = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!account) return;
    const message = await db.$transaction(async (tx) => {
      await lockRecovery(tx, account.id);
      const user = await recoveryUser(tx, account.id);
      if (!eligible(user) || user.email !== email) return null;
      const nonce = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + VALIDITY_MS);
      const token = `${nonce}.${proof(user, nonce, expiresAt)}`;
      // O banco guarda somente o hash do identificador, nunca o link de acesso.
      await tx.verification.deleteMany({ where: { value: user.id, identifier: { startsWith: PREFIX } } });
      const verification = await tx.verification.create({
        data: { id: randomUUID(), identifier: PREFIX + digest(nonce), value: user.id, expiresAt },
      });
      await recordAudit(
        { actorId: null, action: "auth.2fa_recovery_requested", entityType: "User", entityId: user.id },
        tx,
      );
      const url = new URL("/recuperar-autenticador", env.BETTER_AUTH_URL);
      url.searchParams.set("token", token);
      return { verificationId: verification.id, email: user.email, url: url.toString() };
    });
    if (!message) return;
    verificationId = message.verificationId;
    await sendMail({
      to: message.email,
      subject: "Caixinha dos Amigos — recuperar acesso ao autenticador",
      text: [
        "Recebemos um pedido de recuperação do aplicativo autenticador da sua conta.",
        "O link abaixo vale por 15 minutos e só pode ser usado uma vez:",
        message.url,
        "",
        "Ao confirmar, você definirá uma nova senha. As sessões, o autenticador antigo e os códigos de reserva serão invalidados.",
        "Depois, entre novamente e configure um novo autenticador antes de acessar a administração.",
        "",
        "Se você não fez este pedido, ignore esta mensagem. Solicitar o link não altera sua conta.",
      ].join("\n"),
    });
  } catch {
    if (verificationId) await db.verification.deleteMany({ where: { id: verificationId } }).catch(() => {});
    // Nunca registrar erro de transporte com corpo da mensagem ou token de recuperação.
    console.error("[email-recovery] Não foi possível enviar o e-mail de recuperação do autenticador.");
  }
}

async function validRecovery(client: Pick<DbTransaction, "user" | "verification">, token: string) {
  if (!/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new DomainError(INVALID_LINK);
  const [nonce, signature] = token.split(".");
  const verification = await client.verification.findFirst({ where: { identifier: PREFIX + digest(nonce) } });
  if (!verification || verification.expiresAt.getTime() <= Date.now()) throw new DomainError(INVALID_LINK);
  const user = await recoveryUser(client, verification.value);
  if (
    !eligible(user) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(proof(user, nonce, verification.expiresAt)))
  ) {
    throw new DomainError(INVALID_LINK);
  }
  return { user, verification };
}

/** Só o POST explícito consome a prova. Abrir o e-mail/GET não modifica credenciais. */
export async function recoverAuthenticator(token: string, password: string): Promise<string> {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new DomainError(`A senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres.`);
  }
  const initial = await validRecovery(db, token);
  const passwordHash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    await lockRecovery(tx, initial.user.id);
    // Trava também a conta para serializar alterações concorrentes de status/e-mail.
    await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${initial.user.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "account" WHERE "userId" = ${initial.user.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "two_factor" WHERE "userId" = ${initial.user.id} FOR UPDATE`;
    const { user, verification } = await validRecovery(tx, token);
    const consumed = await tx.verification.deleteMany({
      where: { id: verification.id, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) throw new DomainError(INVALID_LINK);
    await tx.account.updateMany({
      where: { userId: user.id, providerId: "credential" },
      data: { password: passwordHash },
    });
    await tx.twoFactor.deleteMany({ where: { userId: user.id } });
    await tx.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, emailVerified: true } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    // Inclui links de senha, desafios 2FA, dispositivos confiáveis e outras recuperações.
    await tx.verification.deleteMany({ where: { value: user.id } });
    await recordAudit(
      {
        actorId: user.id,
        action: "auth.2fa_recovered_email",
        entityType: "User",
        entityId: user.id,
        after: { twoFactorEnabled: false, sessionsRevoked: true },
      },
      tx,
    );
    return user.email;
  });
}

export async function notifyAuthenticatorRecovered(email: string) {
  try {
    await sendMail({
      to: email,
      subject: "Caixinha dos Amigos — acesso recuperado",
      text: "A recuperação da sua conta foi concluída e uma nova senha foi definida. As sessões e o autenticador anterior foram invalidados. Entre novamente e configure o aplicativo autenticador. Se você não fez essa alteração, procure o responsável pelo sistema.",
    });
  } catch {
    console.error("[email-recovery] Não foi possível enviar o aviso de recuperação concluída.");
  }
}
