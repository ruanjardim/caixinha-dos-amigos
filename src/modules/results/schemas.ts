import { z } from "zod";
import { dateField, idField, moneyField, optionalText, requiredText } from "@/lib/validation";

const refField = z
  .string()
  .trim()
  .max(120, "Máximo de 120 caracteres.")
  .optional()
  .transform((v) => (v ? v : null));

export const cycleIdSchema = z.object({ cycleId: idField });
export const calculationIdSchema = z.object({ calculationId: idField });

export const distributionSchema = z.object({
  shareId: idField,
  paidOn: dateField,
  transactionRef: refField,
});

export const adminFeePaymentSchema = z.object({
  calculationId: idField,
  paidOn: dateField,
  transactionRef: refField,
});

export const principalReturnSchema = z.object({
  membershipId: idField,
  paidOn: dateField,
  transactionRef: refField,
});

/** Saldo do extrato pode ser zero (diferente de moneyField, que exige > 0). */
const statementBalanceField = z
  .string({ error: "Informe o saldo do extrato." })
  .trim()
  .min(1, "Informe o saldo do extrato.")
  .transform((v, ctx) => {
    if (/^0+([.,]0{1,2})?$/.test(v.replace(/R\$|\s/g, ""))) return 0;
    const parsed = moneyField.safeParse(v);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: parsed.error.issues[0]?.message ?? "Valor inválido." });
      return z.NEVER;
    }
    return parsed.data;
  });

export const reconciliationSchema = z.object({
  cycleId: idField,
  referenceDate: dateField,
  statementBalanceCents: statementBalanceField,
  notes: optionalText(300),
});

export const postClosingSchema = z.object({
  cycleId: idField,
  kind: z.enum(["REVENUE", "EXPENSE"], { error: "Escolha o tipo." }),
  amountCents: moneyField,
  occurredOn: dateField,
  description: requiredText("a descrição", 200),
  justification: requiredText("a justificativa", 500).refine(
    (v) => v.length >= 20,
    "Justifique com ao menos 20 caracteres.",
  ),
});
