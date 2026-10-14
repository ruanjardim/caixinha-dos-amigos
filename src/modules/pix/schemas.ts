import { z } from "zod";
import { idField, moneyField, optionalText, requiredText } from "@/lib/validation";

export const createChargeSchema = z.object({
  membershipId: idField,
  amountCents: moneyField,
  description: optionalText(40),
  expiresInDays: z.coerce.number().int().min(1, "Mínimo de 1 dia.").max(30, "Máximo de 30 dias."),
});

export const cancelChargeSchema = z.object({
  chargeId: idField,
  reason: requiredText("o motivo", 300),
});

export const SIMULATION_KINDS = [
  "paid",
  "paid_other_amount",
  "resend",
  "second_payment",
  "refund",
  "expire",
  "bad_signature",
] as const;
export type SimulationKind = (typeof SIMULATION_KINDS)[number];

export const simulateEventSchema = z
  .object({
    chargeId: idField,
    kind: z.enum(SIMULATION_KINDS),
    amountCents: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .pipe(z.union([z.null(), moneyField])),
  })
  .refine((v) => v.kind !== "paid_other_amount" || v.amountCents, {
    path: ["amountCents"],
    message: "Informe o valor pago na simulação.",
  });

/** Eventos aceitos do provedor. Campos extras são ignorados; valores sempre em centavos. */
const eventBase = z.object({
  id: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(50),
});
const txid = z.string().trim().min(1).max(35);
const amountCents = z.number().int().positive().max(100_000_000_00);
const timestamp = z.iso.datetime({ offset: true });

export const paidEventSchema = eventBase.extend({
  type: z.literal("pix.paid"),
  txid,
  amountCents,
  endToEndId: z.string().trim().min(1).max(64),
  paidAt: timestamp,
});

export const refundedEventSchema = eventBase.extend({
  type: z.literal("pix.refunded"),
  txid,
  amountCents,
  refundId: z.string().trim().min(1).max(64),
  refundedAt: timestamp,
});

export const expiredEventSchema = eventBase.extend({
  type: z.literal("pix.expired"),
  txid,
});

export { eventBase as webhookEventBaseSchema };
