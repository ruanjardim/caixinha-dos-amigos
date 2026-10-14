"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { toActionError, type ActionState } from "@/lib/errors";
import { checkboxField, formToObject } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/audit";
import { requirePermission } from "@/modules/auth/session";

const preferenceSchema = z.object({ emailNotifications: checkboxField });

/** Preferência de avisos por e-mail — sempre do PRÓPRIO usuário logado. */
export async function updateNotificationPreferenceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("self.profile.update");
    const { emailNotifications } = preferenceSchema.parse(formToObject(formData));
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.userId }, data: { emailNotifications } });
      await recordAudit(
        {
          actorId: user.userId,
          action: "user.notifications",
          entityType: "User",
          entityId: user.userId,
          after: { emailNotifications },
        },
        tx,
      );
    });
    revalidatePath("/minha-caixinha/perfil");
    return {
      ok: true,
      message: emailNotifications ? "Você voltará a receber avisos por e-mail." : "Avisos por e-mail desativados.",
    };
  } catch (e) {
    return toActionError(e);
  }
}
