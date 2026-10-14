"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject, idField, requiredText } from "@/lib/validation";
import { requirePermission } from "@/modules/auth/session";
import { anonymizeParticipant } from "./service";

const anonymizeSchema = z.object({
  participantId: idField,
  reason: requiredText("o motivo", 300),
  confirmation: z.literal("ANONIMIZAR", { error: "Digite ANONIMIZAR para confirmar." }),
});

export async function anonymizeParticipantAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("participants.manage");
    const input = anonymizeSchema.parse(formToObject(formData));
    await anonymizeParticipant(actor, input);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Dados pessoais anonimizados. O histórico financeiro foi preservado." };
  } catch (e) {
    return toActionError(e);
  }
}
