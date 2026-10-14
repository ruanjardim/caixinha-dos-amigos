"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject } from "@/lib/validation";
import { requirePermission } from "@/modules/auth/session";
import { notifyAfterResponse } from "@/modules/notifications/schedule";
import { notifyPixEvent } from "@/modules/notifications/service";
import { outcomeLabel } from "./outcomes";
import { cancelChargeSchema, createChargeSchema, simulateEventSchema } from "./schemas";
import { cancelCharge, createCharge, simulatePixEvent } from "./service";

function revalidatePix() {
  revalidatePath("/admin", "layout");
  revalidatePath("/minha-caixinha", "layout");
}

export async function createChargeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const actor = await requirePermission("payments.register");
    id = (await createCharge(actor, createChargeSchema.parse(formToObject(formData)))).id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePix();
  redirect(`/admin/pix/${id}`);
}

export async function cancelChargeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("payments.register");
    await cancelCharge(actor, cancelChargeSchema.parse(formToObject(formData)));
    revalidatePix();
    return { ok: true, message: "Cobrança cancelada." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Sandbox: dispara um evento assinado pelo mesmo caminho do webhook. */
export async function simulatePixEventAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("payments.register");
    const result = await simulatePixEvent(actor, simulateEventSchema.parse(formToObject(formData)));
    if (result.eventRowId && result.notifyAdmins) {
      const eventRowId = result.eventRowId;
      notifyAfterResponse(() => notifyPixEvent(eventRowId));
    }
    revalidatePix();
    const label =
      result.outcome === "REPETIDO" ? "Evento repetido — ignorado (já processado)" : outcomeLabel(result.outcome);
    return { ok: true, message: `Resposta do webhook: HTTP ${result.httpStatus} — ${label}.` };
  } catch (e) {
    return toActionError(e);
  }
}
