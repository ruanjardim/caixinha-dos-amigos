"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject, idField } from "@/lib/validation";
import { requirePermission } from "@/modules/auth/session";
import {
  acceptRulesSchema,
  cycleSchema,
  draftMembershipSchema,
  leaveSchema,
  membershipSchema,
  quotaChangeSchema,
} from "./schemas";
import {
  acceptRules,
  addMembership,
  changeQuotas,
  closeContributions,
  createCycle,
  leaveCycle,
  openCycle,
  publishRules,
  removeDraftMembership,
  updateCycle,
  updateDraftMembership,
} from "./service";

const cyclePath = (id: string) => `/admin/ciclos/${id}`;

export async function createCycleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const actor = await requirePermission("cycles.manage");
    id = (await createCycle(actor, cycleSchema.parse(formToObject(formData)))).id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin/ciclos");
  redirect(cyclePath(id));
}

export async function updateCycleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const actor = await requirePermission("cycles.manage");
    const data = formToObject(formData);
    id = idField.parse(data.id);
    await updateCycle(actor, id, cycleSchema.parse(data));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(cyclePath(id));
  redirect(cyclePath(id));
}

export async function publishRulesAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("cycles.manage");
    const id = idField.parse(formData.get("id"));
    await publishRules(actor, id);
    revalidatePath(cyclePath(id));
    return { ok: true, message: "Regras publicadas e congeladas. Os participantes já podem registrar o aceite." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function openCycleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("cycles.manage");
    const id = idField.parse(formData.get("id"));
    const r = await openCycle(actor, id);
    revalidatePath(cyclePath(id));
    return {
      ok: true,
      message: `Ciclo aberto: ${r.installments} parcelas previstas geradas para ${r.memberships} participações.`,
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function closeContributionsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("cycles.close");
    const id = idField.parse(formData.get("id"));
    await closeContributions(actor, id);
    revalidatePath(cyclePath(id));
    return { ok: true, message: "Período de contribuições encerrado." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addMembershipAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("quotas.manage");
    const data = formToObject(formData);
    const cycleId = idField.parse(data.cycleId);
    await addMembership(actor, cycleId, membershipSchema.parse(data));
    revalidatePath(cyclePath(cycleId));
    return { ok: true, message: "Participante incluído no ciclo." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateDraftMembershipAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("quotas.manage");
    const input = draftMembershipSchema.parse(formToObject(formData));
    await updateDraftMembership(actor, input.membershipId, input);
    revalidatePath(cyclePath(input.cycleId));
    return { ok: true, message: "Participação atualizada." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeDraftMembershipAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let cycleId: string;
  try {
    const actor = await requirePermission("quotas.manage");
    const data = formToObject(formData);
    cycleId = idField.parse(data.cycleId);
    await removeDraftMembership(actor, idField.parse(data.membershipId));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(cyclePath(cycleId));
  redirect(cyclePath(cycleId));
}

export async function changeQuotasAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("quotas.manage");
    const data = formToObject(formData);
    const membershipId = idField.parse(data.membershipId);
    const n = await changeQuotas(actor, membershipId, quotaChangeSchema.parse(data));
    revalidatePath(`/admin/ciclos`, "layout");
    return { ok: true, message: `Cotas alteradas: ${n} parcela(s) futura(s) recalculada(s).` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function leaveCycleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("participants.manage");
    const data = formToObject(formData);
    const membershipId = idField.parse(data.membershipId);
    const n = await leaveCycle(actor, membershipId, leaveSchema.parse(data));
    revalidatePath(`/admin/ciclos`, "layout");
    return { ok: true, message: `Saída registrada: ${n} parcela(s) futura(s) deixaram de ser devidas.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function acceptRulesAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("self.rules.accept");
    const input = acceptRulesSchema.parse(formToObject(formData));
    await acceptRules(actor, input.cycleId);
    revalidatePath("/minha-caixinha", "layout");
    return { ok: true, message: "Aceite registrado. Obrigado!" };
  } catch (e) {
    return toActionError(e);
  }
}
