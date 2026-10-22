"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { toActionError, type ActionState } from "@/lib/errors";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";
import {
  limitEmailRecovery,
  notifyAuthenticatorRecovered,
  recoverAuthenticator,
  sendAuthenticatorRecovery,
} from "./email-recovery";

async function source() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 100);
}

export async function requestAuthenticatorRecoveryAction(email: string): Promise<ActionState> {
  try {
    const normalized = z.email().max(254).parse(email.trim().toLowerCase());
    await limitEmailRecovery(`request-ip:${await source()}`, 5);
    await limitEmailRecovery(`request-email:${normalized}`, 3);
    after(() => sendAuthenticatorRecovery(normalized));
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function recoverAuthenticatorAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z
      .object({
        token: z.string().max(100),
        password: z
          .string()
          .min(PASSWORD_MIN_LENGTH, "A senha deve ter ao menos 10 caracteres.")
          .max(PASSWORD_MAX_LENGTH, "A senha deve ter no máximo 128 caracteres."),
        confirm: z.string().max(PASSWORD_MAX_LENGTH),
      })
      .refine((data) => data.password === data.confirm, { message: "As senhas não conferem.", path: ["confirm"] })
      .parse(Object.fromEntries(formData));
    await limitEmailRecovery(`complete-ip:${await source()}`, 10);
    const email = await recoverAuthenticator(input.token, input.password);
    after(() => notifyAuthenticatorRecovered(email));
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
