"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject } from "@/lib/validation";
import { requirePermission } from "@/modules/auth/session";
import {
  adminFeePaymentSchema,
  calculationIdSchema,
  cycleIdSchema,
  distributionSchema,
  postClosingSchema,
  principalReturnSchema,
  reconciliationSchema,
} from "./schemas";
import {
  approveResults,
  calculateResults,
  closeCycle,
  postClosingAdjustment,
  reconcileCash,
  registerAdminFeePayment,
  registerDistribution,
  returnPrincipal,
} from "./service";

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/minha-caixinha", "layout");
}

export async function calculateResultsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("results.calculate");
    const { cycleId } = cycleIdSchema.parse(formToObject(formData));
    await calculateResults(actor, cycleId);
    revalidateAll();
    return { ok: true, message: "Apuração calculada (rascunho). Revise antes de aprovar." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveResultsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("results.approve");
    const { calculationId } = calculationIdSchema.parse(formToObject(formData));
    await approveResults(actor, calculationId);
    revalidateAll();
    return { ok: true, message: "Apuração aprovada. Agora registre os pagamentos aos participantes." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function registerDistributionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("results.approve");
    await registerDistribution(actor, distributionSchema.parse(formToObject(formData)));
    revalidateAll();
    return { ok: true, message: "Pagamento registrado." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function registerAdminFeeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("adminFee.configure");
    await registerAdminFeePayment(actor, adminFeePaymentSchema.parse(formToObject(formData)));
    revalidateAll();
    return { ok: true, message: "Remuneração administrativa registrada." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function closeCycleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("cycles.close");
    const { cycleId } = cycleIdSchema.parse(formToObject(formData));
    await closeCycle(actor, cycleId);
    revalidateAll();
    return { ok: true, message: "Ciclo encerrado." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function returnPrincipalAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("participants.manage");
    const r = await returnPrincipal(actor, principalReturnSchema.parse(formToObject(formData)));
    revalidateAll();
    return {
      ok: true,
      message: `Devolução de ${(r.amountCents / 100).toFixed(2).replace(".", ",")} registrada no livro-caixa.`,
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reconcileCashAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("ledger.read");
    const rec = await reconcileCash(actor, reconciliationSchema.parse(formToObject(formData)));
    revalidateAll();
    return rec.differenceCents === 0
      ? { ok: true, message: "Conciliado: o extrato bate com o livro-caixa." }
      : { ok: true, message: "Conciliação registrada COM DIFERENÇA. Investigue antes da apuração." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function postClosingAdjustmentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("expenses.manage");
    await postClosingAdjustment(actor, postClosingSchema.parse(formToObject(formData)));
    revalidateAll();
    return { ok: true, message: "Correção pós-encerramento registrada e auditada." };
  } catch (e) {
    return toActionError(e);
  }
}
