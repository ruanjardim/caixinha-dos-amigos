import { z } from "zod";
import { checkboxField, dateField, idField, moneyField, optionalText, requiredText } from "@/lib/validation";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida.");

const optionalInt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : null))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "Use um número inteiro.");

const optionalMoney = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const r = moneyField.safeParse(v);
    if (!r.success) {
      ctx.addIssue({ code: "custom", message: r.error.issues[0]?.message ?? "Valor inválido." });
      return z.NEVER;
    }
    return r.data;
  });

export const activitySchema = z.object({
  cycleId: idField,
  type: z.enum(["EVENT", "PRODUCT_SALE", "DONATION", "RAFFLE", "OTHER"], { error: "Escolha o tipo." }),
  title: requiredText("o título", 120),
  description: optionalText(3000),
  startsOn: optionalDate,
  endsOn: optionalDate,
  numberRangeStart: optionalInt,
  numberRangeEnd: optionalInt,
  unitPriceCents: optionalMoney,
  promotionRules: optionalText(10_000),
});
export type ActivityInput = z.infer<typeof activitySchema>;

export const activityStatusSchema = z.object({
  activityId: idField,
  status: z.enum(["PLANNED", "IN_PROGRESS", "FINISHED", "CANCELLED"], { error: "Situação inválida." }),
});

export const prizeSchema = z.object({
  activityId: idField,
  name: requiredText("o nome do prêmio", 120),
  description: optionalText(500),
  costCents: optionalMoney,
  position: z.coerce.number().int().min(1).max(100).default(1),
});

export const activityParticipantSchema = z.object({
  activityId: idField,
  participantId: idField,
  role: optionalText(60),
});

export const numberActionSchema = z.object({
  activityId: idField,
  number: z.coerce.number({ error: "Número inválido." }).int("Número inválido.").min(0),
});

export const reserveNumberSchema = numberActionSchema.extend({ participantId: idField });

export const confirmNumberSchema = numberActionSchema.extend({
  paidOn: dateField,
  transactionRef: optionalText(120),
});

export const activityEntrySchema = z.object({
  activityId: idField,
  kind: z.enum(["REVENUE", "COST"], { error: "Escolha receita ou custo." }),
  amountCents: moneyField,
  occurredOn: dateField,
  description: requiredText("a descrição", 200),
});

export const complianceDecisionSchema = z.object({
  activityId: idField,
  legalModality: requiredText("a modalidade legal identificada", 200),
  authorization: optionalText(200),
  legalOpinion: requiredText("o parecer", 5000).refine(
    (v) => v.length >= 30,
    "Descreva o parecer com ao menos 30 caracteres.",
  ),
  decision: z.enum(["APPROVED", "REJECTED"], { error: "Escolha aprovar ou reprovar." }),
});

export const officialResultSchema = z.object({
  activityId: idField,
  drawSource: requiredText("a fonte do resultado (meio autorizado)", 300),
  drawnOn: dateField,
  /** "prizeId=numero" separados por vírgula, montados pelo formulário. */
});

export const flagSchema = z.object({
  key: z.enum(["RAFFLE_SALES_ENABLED", "PIX_LIVE_ENABLED", "ADMIN_PAYOUT_ENABLED"], { error: "Recurso inválido." }),
  enable: checkboxField,
  justification: requiredText("a justificativa", 2000),
  confirmation: z.string().trim().optional(),
});
