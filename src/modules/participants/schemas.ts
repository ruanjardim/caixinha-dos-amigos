import { z } from "zod";
import { dateField, emailField, idField, phoneField, requiredText } from "@/lib/validation";

export const participantSchema = z.object({
  fullName: requiredText("o nome completo", 120).refine((v) => v.split(/\s+/).length >= 2, "Informe nome e sobrenome."),
  email: emailField,
  phone: phoneField,
  joinedAt: dateField,
});
export type ParticipantInput = z.infer<typeof participantSchema>;

export const participantStatusSchema = z.enum(["ACTIVE", "INACTIVE"], { error: "Situação inválida." });

export const ownProfileSchema = z.object({ phone: phoneField });

export const setStatusSchema = z.object({
  id: idField,
  status: participantStatusSchema,
  reason: requiredText("o motivo", 300),
});

export const suspendAccessSchema = z.object({ id: idField, reason: requiredText("o motivo", 300) });
