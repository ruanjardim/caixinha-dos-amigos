import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { env, isProduction } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { hashPassword, verifyPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";
import { recordAudit } from "@/modules/audit/audit";

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
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
