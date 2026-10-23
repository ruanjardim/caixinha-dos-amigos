import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { hashPassword, verifyPassword } from "@/lib/password";
import { auth } from "@/modules/auth/auth";
import { getCurrentUser, homePathFor } from "@/modules/auth/session";
import { hasPermission } from "@/modules/auth/permissions";
import { requestAuthenticatorRecoveryAction, recoverAuthenticatorAction } from "@/modules/auth/email-recovery-actions";
import { limitEmailRecovery, recoverAuthenticator, sendAuthenticatorRecovery } from "@/modules/auth/email-recovery";

const context = vi.hoisted(() => ({
  headers: new Headers(),
  after: [] as (() => void | Promise<void>)[],
}));
vi.mock("next/headers", () => ({
  headers: async () => context.headers,
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/server", () => ({ after: (callback: () => void | Promise<void>) => context.after.push(callback) }));
vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));

const enabled = Boolean(process.env.DATABASE_URL);
const mail = vi.mocked(sendMail);
const OLD_PASSWORD = "Senha anterior de teste 2026!";
const NEW_PASSWORD = "Senha nova de teste 2026!";

async function fixture(options: { status?: "ACTIVE" | "SUSPENDED"; mfa?: boolean } = {}) {
  const id = randomUUID();
  const user = await db.user.create({
    data: {
      id,
      name: "Pessoa da recuperação",
      email: `${id}@recuperacao.local`,
      role: "ADMIN",
      status: options.status ?? "ACTIVE",
      twoFactorEnabled: options.mfa ?? true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(OLD_PASSWORD),
        },
      },
      ...(options.mfa === false
        ? {}
        : {
            twoFactors: {
              create: {
                id: randomUUID(),
                secret: "segredo-ficticio-cifrado",
                backupCodes: "reservas-ficticias-cifradas",
              },
            },
          }),
      sessions: { create: { id: randomUUID(), token: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } },
    },
  });
  return user;
}

function linkFromLastMail() {
  const message = mail.mock.calls.at(-1)?.[0];
  expect(message).toBeDefined();
  const link = message!.text.match(/^https?:\/\/\S+$/m)?.[0];
  expect(link).toBeDefined();
  return new URL(link!);
}

async function issued() {
  const user = await fixture();
  await sendAuthenticatorRecovery(user.email);
  const link = linkFromLastMail();
  const token = link.searchParams.get("token")!;
  return { user, token, link };
}

function form(token: string, password = NEW_PASSWORD, confirm = password) {
  const data = new FormData();
  data.set("token", token);
  data.set("password", password);
  data.set("confirm", confirm);
  return data;
}

describe.skipIf(!enabled)("recuperação por e-mail (integração)", () => {
  beforeEach(() => {
    mail.mockReset().mockResolvedValue(undefined);
    context.headers = new Headers({ "x-forwarded-for": randomUUID() });
    context.after = [];
  });

  it("envia ao e-mail cadastrado, sem telefone, e guarda somente identificador com hash", async () => {
    const { user, token, link } = await issued();
    expect(link.origin).toBe(new URL(env.BETTER_AUTH_URL).origin);
    expect(link.pathname).toBe("/recuperar-autenticador");
    expect(mail.mock.calls[0][0].to).toBe(user.email);
    expect(mail.mock.calls[0][0].text).toContain("15 minutos");
    const record = await db.verification.findFirstOrThrow({ where: { value: user.id } });
    expect(record.identifier).toMatch(/^authenticator-recovery:[a-f0-9]{64}$/);
    expect(JSON.stringify(record)).not.toContain(token.split(".")[0]);
    expect(record.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60000);
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ twoFactorEnabled: true });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it("recupera uma vez, troca a senha e invalida sessões, TOTP, reservas e links pendentes", async () => {
    const { user, token } = await issued();
    await db.verification.createMany({
      data: ["reset-password:teste", "trust-device-teste", "2fa-teste"].map((prefix) => ({
        id: randomUUID(),
        identifier: `${prefix}-${user.id}`,
        value: user.id,
        expiresAt: new Date(Date.now() + 60000),
      })),
    });
    const financialBefore = await Promise.all([db.payment.count(), db.installment.count(), db.ledgerLine.count()]);
    expect(await recoverAuthenticator(token, NEW_PASSWORD)).toBe(user.email);
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      status: "ACTIVE",
      role: "ADMIN",
      twoFactorEnabled: false,
      emailVerified: true,
    });
    expect(await db.twoFactor.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.verification.count({ where: { value: user.id } })).toBe(0);
    const account = await db.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(await verifyPassword({ hash: account.password!, password: NEW_PASSWORD })).toBe(true);
    expect(await verifyPassword({ hash: account.password!, password: OLD_PASSWORD })).toBe(false);
    await expect(recoverAuthenticator(token, NEW_PASSWORD)).rejects.toThrow("Link inválido");
    expect(await Promise.all([db.payment.count(), db.installment.count(), db.ledgerLine.count()])).toEqual(
      financialBefore,
    );
    const audits = await db.auditLog.findMany({ where: { entityId: user.id } });
    expect(audits.some((audit) => audit.action === "auth.2fa_recovered_email")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(token);
    expect(JSON.stringify(audits)).not.toContain(NEW_PASSWORD);
  });

  it("somente uma de duas confirmações simultâneas consegue consumir o link", async () => {
    const { user, token } = await issued();
    const results = await Promise.allSettled([
      recoverAuthenticator(token, NEW_PASSWORD),
      recoverAuthenticator(token, NEW_PASSWORD),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditLog.count({ where: { entityId: user.id, action: "auth.2fa_recovered_email" } })).toBe(1);
  });

  it("reenviar invalida o link anterior sem mudar a conta", async () => {
    const { user, token } = await issued();
    await sendAuthenticatorRecovery(user.email);
    const next = linkFromLastMail().searchParams.get("token")!;
    await expect(recoverAuthenticator(token, NEW_PASSWORD)).rejects.toThrow("Link inválido");
    expect(next).not.toBe(token);
    expect(await recoverAuthenticator(next, NEW_PASSWORD)).toBe(user.email);
  });

  it.each(["email", "password", "factor", "suspended"] as const)(
    "mudança de %s invalida o comprovante já emitido",
    async (change) => {
      const { user, token } = await issued();
      if (change === "email")
        await db.user.update({ where: { id: user.id }, data: { email: `${randomUUID()}@outro.local` } });
      if (change === "password")
        await db.account.updateMany({
          where: { userId: user.id },
          data: { password: await hashPassword("Outra senha válida de teste!") },
        });
      if (change === "factor")
        await db.twoFactor.updateMany({ where: { userId: user.id }, data: { secret: "outro-segredo" } });
      if (change === "suspended") await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
      await expect(recoverAuthenticator(token, NEW_PASSWORD)).rejects.toThrow("Link inválido");
      expect(await db.twoFactor.count({ where: { userId: user.id } })).toBe(1);
      expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    },
  );

  it("recusa link expirado, alterado e prova feita para outra conta", async () => {
    const { user, token } = await issued();
    const other = await issued();
    const mixed = `${token.split(".")[0]}.${other.token.split(".")[1]}`;
    await expect(recoverAuthenticator(mixed, NEW_PASSWORD)).rejects.toThrow("Link inválido");
    await expect(
      recoverAuthenticator(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`, NEW_PASSWORD),
    ).rejects.toThrow("Link inválido");
    await db.verification.updateMany({ where: { value: user.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    await expect(recoverAuthenticator(token, NEW_PASSWORD)).rejects.toThrow("Link inválido");
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it("conta inexistente, suspensa ou sem autenticador não recebe link", async () => {
    const suspended = await fixture({ status: "SUSPENDED" });
    const plain = await fixture({ mfa: false });
    for (const email of [`${randomUUID()}@ausente.local`, suspended.email, plain.email])
      await sendAuthenticatorRecovery(email);
    expect(mail).not.toHaveBeenCalled();
    expect(await db.verification.count({ where: { value: { in: [suspended.id, plain.id] } } })).toBe(0);
  });

  it("falha do envio elimina o link e preserva as credenciais", async () => {
    const user = await fixture();
    mail.mockRejectedValueOnce(new Error("falha de transporte fictícia"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await sendAuthenticatorRecovery(user.email);
      expect(await db.verification.count({ where: { value: user.id } })).toBe(0);
      expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ twoFactorEnabled: true });
      expect(log).toHaveBeenCalledWith(expect.not.stringContaining("token="));
    } finally {
      log.mockRestore();
    }
  });

  it("limite compartilhado é respeitado mesmo em chamadas simultâneas e libera após a janela", async () => {
    const identity = randomUUID();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => limitEmailRecovery(identity, 3)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    const record = await db.rateLimit.findFirstOrThrow({
      where: { key: { startsWith: "authenticator-recovery:" }, count: 3 },
      orderBy: { lastRequest: "desc" },
    });
    await db.rateLimit.update({ where: { id: record.id }, data: { lastRequest: BigInt(Date.now() - 16 * 60000) } });
    await expect(limitEmailRecovery(identity, 3)).resolves.toBeUndefined();
  });

  it("ação pública normaliza o e-mail e devolve a mesma resposta antes do envio", async () => {
    const user = await fixture();
    expect(await requestAuthenticatorRecoveryAction(`  ${user.email.toUpperCase()}  `)).toEqual({ ok: true });
    expect(await requestAuthenticatorRecoveryAction(`${randomUUID()}@ausente.local`)).toEqual({ ok: true });
    expect(mail).not.toHaveBeenCalled();
    for (const callback of context.after) await callback();
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0][0].to).toBe(user.email);
  });

  it("ação aplica limite por conta, inclusive com origens diferentes", async () => {
    const email = `${randomUUID()}@ausente.local`;
    for (let i = 0; i < 3; i++) {
      context.headers.set("x-forwarded-for", randomUUID());
      expect(await requestAuthenticatorRecoveryAction(email)).toEqual({ ok: true });
    }
    context.headers.set("x-forwarded-for", randomUUID());
    expect(await requestAuthenticatorRecoveryAction(email)).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(context.after).toHaveLength(3);
  });

  it("não consome link quando a confirmação de senha diverge; envia aviso após concluir", async () => {
    const { user, token } = await issued();
    expect(await recoverAuthenticatorAction({}, form(token, NEW_PASSWORD, "Diferente!"))).toMatchObject({
      ok: false,
      fieldErrors: { confirm: expect.any(Array) },
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ twoFactorEnabled: true });
    expect(await recoverAuthenticatorAction({}, form(token))).toEqual({ ok: true });
    for (const callback of context.after) await callback();
    expect(mail.mock.calls.at(-1)![0]).toMatchObject({
      to: user.email,
      subject: expect.stringContaining("acesso recuperado"),
    });
  });

  it("links da recuperação de senha e do autenticador têm finalidades distintas", async () => {
    const { user, token } = await issued();
    await expect(auth.api.resetPassword({ body: { token, newPassword: NEW_PASSWORD } })).rejects.toThrow();
    await auth.api.requestPasswordReset({
      body: { email: user.email, redirectTo: `${env.BETTER_AUTH_URL}/redefinir-senha` },
    });
    const nativeToken = linkFromLastMail().pathname.split("/").at(-1)!;
    await expect(recoverAuthenticator(nativeToken, NEW_PASSWORD)).rejects.toThrow("Link inválido");
    await auth.api.resetPassword({ body: { token: nativeToken, newPassword: NEW_PASSWORD } });
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ twoFactorEnabled: true });
    const login = await auth.api.signInEmail({ body: { email: user.email, password: NEW_PASSWORD } });
    expect(login).toMatchObject({ twoFactorRedirect: true });
    await expect(recoverAuthenticator(token, NEW_PASSWORD)).rejects.toThrow("Link inválido");
  });

  it("após recuperar, login exige novo cadastro TOTP antes de administrar e mantém o papel do grupo", async () => {
    const { user, token } = await issued();
    const group = await db.caixinha.create({
      data: {
        name: "Grupo da recuperação",
        slug: randomUUID(),
        ownerId: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    await recoverAuthenticator(token, NEW_PASSWORD);
    const login = await auth.api.signInEmail({
      body: { email: user.email, password: NEW_PASSWORD },
      returnHeaders: true,
    });
    context.headers.set(
      "cookie",
      login.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; "),
    );
    const current = await getCurrentUser();
    expect(current).toMatchObject({
      userId: user.id,
      caixinhaId: group.id,
      caixinhaRole: "OWNER",
      twoFactorPending: true,
    });
    expect(homePathFor(current!)).toBe("/seguranca/dois-fatores");
    expect(hasPermission(current, "users.manage")).toBe(false);
    expect(hasPermission(current, "payments.confirm")).toBe(false);
  });
});
