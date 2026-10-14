/**
 * Escolha dos lembretes de vencimento (puro e testável).
 * - "before": parcela em aberto que vence nos próximos `daysBefore` dias (inclui hoje);
 * - "late": parcela vencida há até `lateWindowDays` dias (evita avisos de atrasos antigos em massa).
 * Cada parcela recebe no máximo um lembrete de cada tipo (a chave de envio garante isso).
 */
import { daysBetween, type ISODate } from "./dates";
import type { InstallmentCoverage } from "./contributions";
import type { Cents } from "./money";

export type ReminderKind = "before" | "late";

export type DueReminder = {
  installmentId: string;
  kind: ReminderKind;
  competence: string;
  dueDate: ISODate;
  remainingCents: Cents;
};

export function selectDueReminders(
  installments: readonly InstallmentCoverage[],
  today: ISODate,
  options: { daysBefore?: number; lateWindowDays?: number } = {},
): DueReminder[] {
  const daysBefore = options.daysBefore ?? 3;
  const lateWindow = options.lateWindowDays ?? 30;
  const result: DueReminder[] = [];
  for (const i of installments) {
    if (i.remainingCents <= 0) continue;
    const until = daysBetween(today, i.dueDate);
    let kind: ReminderKind | null = null;
    if (until >= 0 && until <= daysBefore) kind = "before";
    else if (until < 0 && -until <= lateWindow) kind = "late";
    if (kind) {
      result.push({
        installmentId: i.id,
        kind,
        competence: i.competence,
        dueDate: i.dueDate,
        remainingCents: i.remainingCents,
      });
    }
  }
  return result;
}
