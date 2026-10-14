"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject } from "@/lib/validation";
import { requirePermission } from "@/modules/auth/session";
import { manualEntrySchema, reverseEntrySchema } from "./schemas";
import { recordManualEntry, reverseEntry } from "./service";

export async function manualEntryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("expenses.manage");
    const input = manualEntrySchema.parse(formToObject(formData));
    if (input.kind === "REVENUE") await requirePermission("revenues.manage");
    await recordManualEntry(actor, input);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Lançamento registrado no livro-caixa." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reverseEntryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("expenses.manage");
    await reverseEntry(actor, reverseEntrySchema.parse(formToObject(formData)));
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Estorno registrado. O lançamento original foi mantido no histórico." };
  } catch (e) {
    return toActionError(e);
  }
}
