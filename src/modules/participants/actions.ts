"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject, idField } from "@/lib/validation";
import { requirePermission } from "@/modules/auth/session";
import { ownProfileSchema, participantSchema, setStatusSchema, suspendAccessSchema } from "./schemas";
import {
  createParticipant,
  grantAccess,
  setParticipantStatus,
  suspendAccess,
  updateOwnProfile,
  updateParticipant,
} from "./service";

export async function createParticipantAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const actor = await requirePermission("participants.manage");
    const input = participantSchema.parse(formToObject(formData));
    id = (await createParticipant(actor, input)).id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin/participantes");
  redirect(`/admin/participantes/${id}`);
}

export async function updateParticipantAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("participants.manage");
    const data = formToObject(formData);
    const id = idField.parse(data.id);
    await updateParticipant(actor, id, participantSchema.parse(data));
    revalidatePath(`/admin/participantes/${id}`);
    return { ok: true, message: "Cadastro atualizado." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setParticipantStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("participants.manage");
    const input = setStatusSchema.parse(formToObject(formData));
    await setParticipantStatus(actor, input.id, input.status, input.reason);
    revalidatePath(`/admin/participantes/${input.id}`);
    return {
      ok: true,
      message: input.status === "ACTIVE" ? "Cadastro reativado." : "Cadastro inativado e acesso suspenso.",
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function grantAccessAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("users.manage");
    const id = idField.parse(formData.get("id"));
    await grantAccess(actor, id);
    revalidatePath(`/admin/participantes/${id}`);
    return {
      ok: true,
      message: "Convite enviado: o participante receberá um link para definir a senha (válido por 1 hora).",
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function suspendAccessAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("users.manage");
    const input = suspendAccessSchema.parse(formToObject(formData));
    await suspendAccess(actor, input.id, input.reason);
    revalidatePath(`/admin/participantes/${input.id}`);
    return { ok: true, message: "Acesso suspenso. As sessões abertas foram encerradas." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateOwnProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("self.profile.update");
    await updateOwnProfile(actor, ownProfileSchema.parse(formToObject(formData)));
    revalidatePath("/minha-caixinha/perfil");
    return { ok: true, message: "Dados atualizados." };
  } catch (e) {
    return toActionError(e);
  }
}
