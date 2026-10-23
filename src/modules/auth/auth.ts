import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { env, isProduction } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { hashPassword, verifyPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";
import { recordAudit } from "@/modules/audit/audit";

/** Rotas de autenticação cujo resultado (sucesso ou falha) vai para a auditoria. */
const AUDITED_2FA: Record<string, string> = {
  "/two-factor/enable": "auth.2fa_setup_started",
  "/two-factor/verify-totp": "auth.2fa_verify",
  "/two-factor/verify-backup-code": "auth.2fa_backup_code",
  "/two-factor/disable": "auth.2fa_disabled",
  "/two-factor/generate-backup-codes": "auth.2fa_backup_codes_regenerated",
};

export const auth = betterAuth({
  appName: "Caixinha dos Amigos",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  telemetry: { enabled: false },

  emailAndPassword: {
    enabled: true,
    // Grupo privado: contas são criadas somente pelo administrador (convite).
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    password: { hash: hashPassword, verify: verifyPassword },
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hora
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Caixinha dos Amigos — redefinição de senha",
        text: [
          `Olá, ${user.name}!`,
          "",
          "Recebemos um pedido para definir uma nova senha de acesso.",
          `Use o link abaixo (válido por 1 hora):`,
          url,
          "",
          "Se você não fez este pedido, ignore este e-mail. Sua senha atual continua válida.",
        ].join("\n"),
      });
    },
    onPasswordReset: async ({ user }) => {
      await recordAudit({
        actorId: user.id,
        action: "auth.password_reset",
        entityType: "User",
        entityId: user.id,
      });
    },
  },

  user: {
    additionalFields: {
      // `input: false` impede que o cliente defina estes campos.
      role: { type: "string", required: false, defaultValue: "PARTICIPANT", input: false },
      status: { type: "string", required: false, defaultValue: "ACTIVE", input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 dias
    updateAge: 60 * 60 * 24, // renova a cada 24 h de uso
    freshAge: 60 * 15, // operações sensíveis exigem login recente (15 min)
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 15 * 60, max: 3 },
      "/reset-password": { window: 15 * 60, max: 5 },
      "/change-password": { window: 15 * 60, max: 5 },
    },
  },

  advanced: {
    useSecureCookies: isProduction,
    cookiePrefix: "caixinha",
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProduction },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Administradores não podem desligar a verificação em duas etapas (obrigatória).
      if (ctx.path === "/two-factor/disable" && env.ADMIN_2FA_REQUIRED) {
        const session = await getSessionFromCtx(ctx);
        const user = session
          ? await db.user.findUnique({
              where: { id: session.user.id },
              select: {
                role: true,
                caixinhas: {
                  where: { role: { in: ["OWNER", "ADMIN"] }, caixinha: { status: "ACTIVE" } },
                  select: { id: true },
                  take: 1,
                },
              },
            })
          : null;
        if (user?.role === "ADMIN" || user?.caixinhas.length) {
          throw new APIError("FORBIDDEN", {
            message: "A verificação em duas etapas é obrigatória para administradores.",
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      const failure = isAPIError(returned) ? returned : null;
      const failed = Boolean(failure);
      if (ctx.path === "/sign-in/email" && failed) {
        // Tentativa de login malsucedida: registra o e-mail digitado (nunca a senha).
        const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase().slice(0, 120) : null;
        await recordAudit({
          actorId: null,
          action: "auth.login_failed",
          entityType: "User",
          after: { email },
        });
        return;
      }
      const action = AUDITED_2FA[ctx.path];
      if (action) {
        const userId = ctx.context.newSession?.user.id ?? ctx.context.session?.user.id ?? null;
        await recordAudit({
          actorId: userId,
          action: failed ? `${action}_failed` : action,
          entityType: "User",
          entityId: userId,
          after: failure
            ? {
                httpStatus: failure.statusCode,
                errorCode:
                  typeof failure.body?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(failure.body.code)
                    ? failure.body.code
                    : "UNKNOWN",
              }
            : undefined,
        });
      }
    }),
  },

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Usuário suspenso não consegue iniciar sessão.
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { status: true },
          });
          if (!user || user.status !== "ACTIVE") return false;
          return { data: session };
        },
        after: async (session) => {
          await recordAudit({
            actorId: session.userId,
            action: "auth.login",
            entityType: "Session",
            entityId: session.id,
          });
        },
      },
    },
  },

  // Deve ser o último plugin: grava cookies em Server Actions.
  plugins: [
    twoFactor({
      issuer: "Caixinha dos Amigos",
      backupCodeOptions: { amount: 10, length: 10 },
      // Bloqueia a conta por 15 min após 10 códigos errados seguidos.
      accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
