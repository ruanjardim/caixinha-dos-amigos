import { z } from "zod";
import { MoneyError, parseBRL } from "@/domain/money";
import { competenceField, dateField, idField, requiredText } from "@/lib/validation";

/** "50; 100" ou "50,00 / 100,00" → [5000, 10000] (centavos, sem repetição, em ordem). */
const quotaValuesField = z
  .string({ error: "Informe os valores de cota." })
  .trim()
  .min(1, "Informe ao menos um valor de cota.")
  .transform((value, ctx) => {
    const parts = value
      .split(/[;/\n]|\s+e\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const cents: number[] = [];
    for (const part of parts) {
      try {
        const c = parseBRL(part);
        if (c <= 0) throw new MoneyError("Valor de cota deve ser maior que zero.");
        cents.push(c);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : `Valor inválido: ${part}` });
        return z.NEVER;
      }
    }
    return [...new Set(cents)].sort((a, b) => a - b);
  })
  .refine((v) => v.length > 0 && v.length <= 10, "Informe de 1 a 10 valores de cota.");

const percentField = z
  .string({ error: "Informe o percentual." })
  .trim()
  .regex(/^\d{1,3}([.,]\d{1,2})?$/, "Percentual inválido (ex.: 10 ou 7,5).")
  .transform((v) => Math.round(Number(v.replace(",", ".")) * 100))
  .refine((bps) => bps >= 0 && bps <= 5000, "O percentual deve estar entre 0% e 50%.");

export const cycleSchema = z
  .object({
    name: requiredText("o nome do ciclo", 80),
    startDate: dateField,
    contributionEndDate: dateField,
    settlementDate: dateField,
    dueDay: z.coerce
      .number({ error: "Dia inválido." })
      .int("Dia inválido.")
      .min(1, "Use um dia entre 1 e 28.")
      .max(28, "Use um dia entre 1 e 28."),
    adminFeePercent: percentField,
    quotaValues: quotaValuesField,
    rulesText: z.string().trim().max(20_000, "Texto muito longo.").optional().default(""),
  })
  .refine((v) => v.contributionEndDate > v.startDate, {
    path: ["contributionEndDate"],
    message: "Deve ser posterior ao início do ciclo.",
  })
  .refine((v) => v.settlementDate >= v.contributionEndDate, {
    path: ["settlementDate"],
    message: "Deve ser igual ou posterior ao fim das contribuições.",
  });
export type CycleInput = z.infer<typeof cycleSchema>;

const quotaCountField = z.coerce
  .number({ error: "Quantidade inválida." })
  .int("Use um número inteiro.")
  .min(1, "Mínimo de 1 cota.")
  .max(100, "Máximo de 100 cotas.");

const quotaValueCentsField = z.coerce
  .number({ error: "Escolha o valor da cota." })
  .int()
  .positive("Escolha o valor da cota.");

export const membershipSchema = z.object({
  participantId: idField,
  quotaCount: quotaCountField,
  quotaValueCents: quotaValueCentsField,
  joinedAt: dateField,
});

export const quotaChangeSchema = z.object({
  quotaCount: quotaCountField,
  quotaValueCents: quotaValueCentsField,
  effectiveFrom: competenceField,
  reason: requiredText("o motivo", 300),
});

export const leaveSchema = z.object({
  leftAt: dateField,
  reason: requiredText("o motivo", 300),
});

export const draftMembershipSchema = membershipSchema
  .omit({ participantId: true })
  .extend({ membershipId: idField, cycleId: idField });

export const acceptRulesSchema = z.object({
  cycleId: idField,
  agree: z.literal("on", { error: "Marque que leu e concorda." }),
});
