import { z } from "zod";
import { checkboxField, dateField, idField, moneyField, optionalText, requiredText } from "@/lib/validation";

export const manualMethodField = z.enum(["PIX_MANUAL", "BANK_TRANSFER", "CASH", "OTHER"], {
  error: "Escolha a forma de pagamento.",
});

const transactionRefField = z
  .string()
  .trim()
  .max(120, "Máximo de 120 caracteres.")
  .optional()
  .transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : null));

const idempotencyKeyField = z.uuid("Formulário inválido. Recarregue a página.");

const basePaymentFields = {
  amountCents: moneyField,
  receivedAt: dateField,
  method: manualMethodField,
  transactionRef: transactionRefField,
  notes: optionalText(500),
  idempotencyKey: idempotencyKeyField,
  acknowledgeDuplicate: checkboxField,
};

/** Registro pela administração. */
export const registerPaymentSchema = z
  .object({
    membershipId: idField,
    ...basePaymentFields,
    confirmNow: checkboxField,
    confirmationNote: optionalText(500),
  })
  .refine((v) => v.method === "CASH" || v.method === "OTHER" || v.transactionRef, {
    path: ["transactionRef"],
    message: "Informe a referência da transação (ID do Pix ou comprovante).",
  });

/** Informado pelo próprio participante (fica "em análise"). */
export const informPaymentSchema = z.object({
  membershipId: idField,
  ...basePaymentFields,
});

export const confirmPaymentSchema = z.object({
  paymentId: idField,
  receivedAt: dateField,
  confirmationNote: optionalText(500),
});

export const rejectPaymentSchema = z.object({
  paymentId: idField,
  reason: requiredText("o motivo", 300),
});

export const reversePaymentSchema = z.object({
  paymentId: idField,
  reversedAt: dateField,
  reason: requiredText("o motivo do estorno", 300),
});

export const editPaymentSchema = z.object({
  paymentId: idField,
  amountCents: moneyField,
  receivedAt: dateField,
  method: manualMethodField,
  transactionRef: transactionRefField,
  notes: optionalText(500),
});
