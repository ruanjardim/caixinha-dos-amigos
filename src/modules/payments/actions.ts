"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject } from "@/lib/validation";
import { requirePermission } from "@/modules/auth/session";
import { saveUpload } from "@/modules/files/service";
import {
  confirmPaymentSchema,
  editPaymentSchema,
  informPaymentSchema,
  registerPaymentSchema,
  rejectPaymentSchema,
  reversePaymentSchema,
} from "./schemas";
import {
  confirmPayment,
  editPendingPayment,
  informPayment,
  registerPayment,
  rejectPayment,
  reversePayment,
} from "./service";

function revalidatePayments() {
  revalidatePath("/admin", "layout");
  revalidatePath("/minha-caixinha", "layout");
}

export async function registerPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const actor = await requirePermission("payments.register");
    const input = registerPaymentSchema.parse(formToObject(formData));
    if (input.confirmNow) await requirePermission("payments.confirm");
    const proof = await saveUpload(formData.get("proof"), actor.userId);
    id = (await registerPayment(actor, { ...input, proofFileId: proof?.id ?? null })).id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePayments();
  redirect(`/admin/pagamentos/${id}`);
}

export async function informPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("self.payments.inform");
    const input = informPaymentSchema.parse(formToObject(formData));
    const proof = await saveUpload(formData.get("proof"), actor.userId);
    await informPayment(actor, { ...input, proofFileId: proof?.id ?? null });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePayments();
  redirect("/minha-caixinha?informado=1");
}

export async function confirmPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("payments.confirm");
    const input = confirmPaymentSchema.parse(formToObject(formData));
    await confirmPayment(actor, input);
    revalidatePayments();
    return { ok: true, message: "Pagamento confirmado e lançado no livro-caixa." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function rejectPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("payments.confirm");
    await rejectPayment(actor, rejectPaymentSchema.parse(formToObject(formData)));
    revalidatePayments();
    return { ok: true, message: "Pagamento recusado." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reversePaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("payments.confirm");
    await reversePayment(actor, reversePaymentSchema.parse(formToObject(formData)));
    revalidatePayments();
    return { ok: true, message: "Pagamento estornado. O livro-caixa recebeu o lançamento inverso." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function editPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("payments.register");
    await editPendingPayment(actor, editPaymentSchema.parse(formToObject(formData)));
    revalidatePayments();
    return { ok: true, message: "Dados do pagamento corrigidos." };
  } catch (e) {
    return toActionError(e);
  }
}
