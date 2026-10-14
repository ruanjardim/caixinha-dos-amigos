import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { auth } from "@/modules/auth/auth";
import { hasPermission, isRole, type Actor, type Permission } from "@/modules/auth/permissions";

export type CurrentUser = Actor & { name: string; email: string; twoFactorEnabled?: boolean };

export const TWO_FACTOR_SETUP_PATH = "/seguranca/dois-fatores";

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para esta operação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sessão expirada. Entre novamente.");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Usuário autenticado da requisição atual (memoizado por requisição).
 * Papel e status são relidos do banco a cada requisição — uma suspensão ou
 * mudança de papel tem efeito imediato.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      twoFactorEnabled: true,
      participant: { select: { id: true } },
    },
  });
  if (!user || !isRole(user.role)) return null;

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    participantId: user.participant?.id ?? null,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorPending: user.role === "ADMIN" && env.ADMIN_2FA_REQUIRED && !user.twoFactorEnabled,
  };
});

/** Para páginas: redireciona ao login se não houver sessão ativa. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") redirect("/login");
  // Administrador sem verificação em duas etapas: configura antes de qualquer outra coisa.
  if (user.twoFactorPending) redirect(TWO_FACTOR_SETUP_PATH);
  return user;
}

/** Para páginas: exige uma permissão; sem ela, volta para a área inicial. */
export async function requirePagePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) redirect("/");
  return user;
}

/** Para Server Actions e Route Handlers: lança erro em vez de redirecionar. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  if (!hasPermission(user, permission)) throw new ForbiddenError();
  return user;
}

/** Página inicial conforme o perfil. */
export function homePathFor(user: Pick<Actor, "role" | "twoFactorPending">): string {
  if (user.twoFactorPending) return TWO_FACTOR_SETUP_PATH;
  return user.role === "ADMIN" ? "/admin" : "/minha-caixinha";
}
