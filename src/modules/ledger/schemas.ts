import { z } from "zod";
import { dateField, idField, moneyField, requiredText } from "@/lib/validation";

export const manualEntrySchema = z.object({
  cycleId: idField,
  kind: z.enum(["REVENUE", "EXPENSE", "TAX"], { error: "Escolha o tipo de lançamento." }),
  amountCents: moneyField,
  occurredOn: dateField,
  description: requiredText("a descrição", 200),
});

export const reverseEntrySchema = z.object({
  transactionId: idField,
  occurredOn: dateField,
  reason: requiredText("o motivo do estorno", 300),
});
