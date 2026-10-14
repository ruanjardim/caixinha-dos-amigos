"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject, idField, optionalText } from "@/lib/validation";
import { requirePermission } from "@/modules/auth/session";
import {
  activityEntrySchema,
  activityParticipantSchema,
  activitySchema,
  activityStatusSchema,
  complianceDecisionSchema,
  confirmNumberSchema,
  flagSchema,
  numberActionSchema,
  officialResultSchema,
  prizeSchema,
  reserveNumberSchema,
} from "./schemas";
import {
  activateAuthorizedMode,
  addActivityImage,
  addActivityParticipant,
  addPrize,
  confirmNumber,
  createActivity,
  decideCompliance,
  generateNumbers,
  recordActivityEntry,
  recordOfficialResult,
  releaseNumber,
  removeActivityImage,
  removeActivityParticipant,
  removePrize,
  reserveNumber,
  runSimulatedDraw,
  setActivityStatus,
  setFeatureFlag,
  updateActivity,
} from "./service";

const path = (id: string) => `/admin/arrecadacao/${id}`;
function refresh(id?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/minha-caixinha", "layout");
  if (id) revalidatePath(path(id));
}

async function run(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    return toActionError(e);
  }
}

export async function createActivityAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const actor = await requirePermission("fundraising.manage");
    id = (await createActivity(actor, activitySchema.parse(formToObject(formData)))).id;
  } catch (e) {
    return toActionError(e);
  }
  refresh();
  redirect(path(id));
}

export async function updateActivityAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const data = formToObject(formData);
    const id = idField.parse(data.activityId);
    await updateActivity(actor, id, activitySchema.parse(data));
    refresh(id);
    return { ok: true, message: "Atividade atualizada." };
  });
}

export async function setActivityStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const input = activityStatusSchema.parse(formToObject(formData));
    await setActivityStatus(actor, input.activityId, input.status);
    refresh(input.activityId);
    return { ok: true, message: "Situação atualizada." };
  });
}

export async function addPrizeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const input = prizeSchema.parse(formToObject(formData));
    await addPrize(actor, input);
    refresh(input.activityId);
    return { ok: true, message: "Prêmio incluído." };
  });
}

export async function removePrizeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const data = formToObject(formData);
    await removePrize(actor, idField.parse(data.prizeId));
    refresh(data.activityId);
    return { ok: true, message: "Prêmio removido." };
  });
}

export async function addImageAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const data = formToObject(formData);
    const id = idField.parse(data.activityId);
    await addActivityImage(actor, id, formData.get("image"), optionalText(200).parse(data.caption));
    refresh(id);
    return { ok: true, message: "Imagem adicionada." };
  });
}

export async function removeImageAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const data = formToObject(formData);
    await removeActivityImage(actor, idField.parse(data.imageId));
    refresh(data.activityId);
    return { ok: true, message: "Imagem removida." };
  });
}

export async function addActivityParticipantAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const input = activityParticipantSchema.parse(formToObject(formData));
    await addActivityParticipant(actor, input);
    refresh(input.activityId);
    return { ok: true, message: "Participante incluído na atividade." };
  });
}

export async function removeActivityParticipantAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const data = formToObject(formData);
    await removeActivityParticipant(actor, idField.parse(data.id));
    refresh(data.activityId);
    return { ok: true, message: "Participante removido da atividade." };
  });
}

export async function generateNumbersAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const id = idField.parse(formData.get("activityId"));
    const n = await generateNumbers(actor, id);
    refresh(id);
    return { ok: true, message: `${n} números gerados.` };
  });
}

export async function reserveNumberAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const input = reserveNumberSchema.parse(formToObject(formData));
    await reserveNumber(actor, input);
    refresh(input.activityId);
    return { ok: true, message: `Número ${input.number} reservado.` };
  });
}

export async function releaseNumberAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const input = numberActionSchema.parse(formToObject(formData));
    await releaseNumber(actor, input);
    refresh(input.activityId);
    return { ok: true, message: `Número ${input.number} liberado.` };
  });
}

export async function confirmNumberAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const input = confirmNumberSchema.parse(formToObject(formData));
    await confirmNumber(actor, input);
    refresh(input.activityId);
    return { ok: true, message: `Número ${input.number} confirmado.` };
  });
}

export async function simulatedDrawAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const id = idField.parse(formData.get("activityId"));
    const winner = await runSimulatedDraw(actor, id);
    return {
      ok: true,
      message: `SIMULAÇÃO — número sorteado: ${winner}. Este resultado não é oficial e não foi gravado.`,
    };
  });
}

export async function officialResultAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const data = formToObject(formData);
    const input = officialResultSchema.parse(data);
    const winners = Object.entries(data)
      .filter(([k]) => k.startsWith("winner_"))
      .map(([k, v]) => ({
        prizeId: k.slice("winner_".length),
        winningNumber: z.coerce.number().int().min(0).parse(v),
      }));
    const result = await recordOfficialResult(actor, { ...input, winners });
    refresh(input.activityId);
    return { ok: true, message: `Resultado oficial registrado: ${result}` };
  });
}

export async function activityEntryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("fundraising.manage");
    const input = activityEntrySchema.parse(formToObject(formData));
    await recordActivityEntry(actor, input);
    refresh(input.activityId);
    return { ok: true, message: "Lançamento da atividade registrado no livro-caixa." };
  });
}

export async function complianceDecisionAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("compliance.decide");
    const input = complianceDecisionSchema.parse(formToObject(formData));
    const doc = formData.get("document");
    await decideCompliance(actor, input, doc instanceof File && doc.size > 0 ? doc : undefined);
    refresh(input.activityId);
    revalidatePath("/admin/conformidade");
    return {
      ok: true,
      message: input.decision === "APPROVED" ? "Parecer favorável registrado." : "Parecer contrário registrado.",
    };
  });
}

export async function activateAuthorizedModeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("compliance.decide");
    const id = idField.parse(formData.get("activityId"));
    await activateAuthorizedMode(actor, id);
    refresh(id);
    return { ok: true, message: "Modo autorizado ativado para esta atividade." };
  });
}

export async function setFlagAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("compliance.decide");
    const input = flagSchema.parse(formToObject(formData));
    await setFeatureFlag(actor, input);
    refresh();
    revalidatePath("/admin/conformidade");
    return { ok: true, message: input.enable ? "Recurso ativado (registrado na auditoria)." : "Recurso desativado." };
  });
}
