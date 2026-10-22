import "server-only";
import type { DbTransaction } from "@/lib/db";
import { env } from "@/lib/env";
import { hasPermission } from "@/modules/auth/permissions";
import { ForbiddenError, type CurrentUser } from "@/modules/auth/session";

/** Revalida no banco quem pode convidar ou suspender acessos no grupo atual. */
export async function requireAccessManager(actor: CurrentUser, tx: DbTransaction): Promise<string | null> {
  const caixinhaId = actor.caixinhaId ?? null;
  const user = await tx.user.findUnique({
    where: { id: actor.userId },
    select: { role: true, status: true, twoFactorEnabled: true },
  });
  if (!user) throw new ForbiddenError();

  const membership = caixinhaId
    ? await tx.caixinhaMember.findUnique({
        where: { caixinhaId_userId: { caixinhaId, userId: actor.userId } },
        select: { role: true, caixinha: { select: { status: true } } },
      })
    : null;

  if (caixinhaId && (!membership || membership.caixinha.status !== "ACTIVE")) throw new ForbiddenError();
  if (
    !hasPermission(
      {
        userId: actor.userId,
        role: user.role,
        status: user.status,
        participantId: null,
        caixinhaRole: membership?.role ?? null,
        twoFactorPending: env.ADMIN_2FA_REQUIRED && !user.twoFactorEnabled,
      },
      "users.manage",
    )
  ) {
    throw new ForbiddenError();
  }

  // Dados legados sem grupo continuam restritos ao administrador global.
  // `null` deve ser usado como filtro explícito, nunca como ausência de filtro.
  return caixinhaId;
}
