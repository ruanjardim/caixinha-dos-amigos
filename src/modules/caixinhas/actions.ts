"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionError, type ActionState } from "@/lib/errors";
import { formToObject, idField } from "@/lib/validation";
import {
  ACTIVE_CAIXINHA_COOKIE,
  homePathFor,
  requireUser,
} from "@/modules/auth/session";
import { caixinhaSchema } from "./schemas";
import { assertCaixinhaAccess, createCaixinha } from "./service";

async function rememberCaixinha(id: string) {
  (await cookies()).set(ACTIVE_CAIXINHA_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createCaixinhaAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireUser();
    const caixinha = await createCaixinha(actor, caixinhaSchema.parse(formToObject(formData)));
    await rememberCaixinha(caixinha.id);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/", "layout");
  redirect("/admin");
}

export async function switchCaixinhaAction(formData: FormData): Promise<void> {
  const actor = await requireUser();
  const caixinhaId = idField.parse(formData.get("caixinhaId"));
  const membership = await assertCaixinhaAccess(actor.userId, caixinhaId);
  await rememberCaixinha(caixinhaId);
  revalidatePath("/", "layout");
  redirect(homePathFor({ ...actor, caixinhaRole: membership.role, twoFactorPending: false }));
}

