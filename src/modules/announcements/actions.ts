"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject, idField } from "@/lib/validation";
import { requirePermission } from "@/modules/auth/session";
import { announcementSchema } from "./schemas";
import { saveAnnouncement, setAnnouncementPublished } from "./service";

function revalidateAnnouncements() {
  revalidatePath("/admin/comunicados", "layout");
  revalidatePath("/minha-caixinha", "layout");
}

export async function createAnnouncementAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("announcements.manage");
    const input = announcementSchema.parse(formToObject(formData));
    await saveAnnouncement(actor, input);
    revalidateAnnouncements();
    return { ok: true, message: input.publishNow ? "Comunicado publicado." : "Rascunho salvo." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateAnnouncementAction(_: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const actor = await requirePermission("announcements.manage");
    const data = formToObject(formData);
    id = idField.parse(data.id);
    await saveAnnouncement(actor, { ...announcementSchema.parse(data), id });
  } catch (e) {
    return toActionError(e);
  }
  revalidateAnnouncements();
  redirect("/admin/comunicados");
}

export async function toggleAnnouncementAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("announcements.manage");
    const data = formToObject(formData);
    const publish = data.publish === "true";
    await setAnnouncementPublished(actor, idField.parse(data.id), publish);
    revalidateAnnouncements();
    return { ok: true, message: publish ? "Comunicado publicado." : "Comunicado voltou para rascunho." };
  } catch (e) {
    return toActionError(e);
  }
}
