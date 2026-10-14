/**
 * Datas de calendário sem fuso horário ("AAAA-MM-DD") e competências ("AAAA-MM").
 *
 * Datas financeiras (vencimento, crédito, início do ciclo) são DIAS, não instantes.
 * Trabalhar com strings ISO evita erros de fuso horário (ex.: 01/12 virar 30/11).
 */

export type ISODate = string; // "2026-12-01"
export type Competence = string; // "2026-12"

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const COMPETENCE = /^(\d{4})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export class DateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateError";
  }
}

function pad(n: number, size = 2) {
  return String(n).padStart(size, "0");
}

export function isISODate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function assertISODate(value: string, label = "data"): asserts value is ISODate {
  if (!isISODate(value)) throw new DateError(`${label} inválida: "${value}".`);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Date (meia-noite UTC, como o Prisma devolve colunas @db.Date) → "AAAA-MM-DD". */
export function toISODate(date: Date): ISODate {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** "AAAA-MM-DD" → Date à meia-noite UTC (formato esperado pelo Prisma em @db.Date). */
export function fromISODate(value: ISODate): Date {
  assertISODate(value);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Dias corridos de `from` até `to` (positivo se `to` for depois). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / MS_PER_DAY);
}

export function competenceOf(date: ISODate): Competence {
  assertISODate(date);
  return date.slice(0, 7);
}

export function parseCompetence(value: Competence): { year: number; month: number } {
  const m = COMPETENCE.exec(value);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new DateError(`Competência inválida: "${value}".`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function addMonths(competence: Competence, months: number): Competence {
  const { year, month } = parseCompetence(competence);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Todas as competências de `from` até `to`, inclusive. */
export function competencesBetween(from: Competence, to: Competence): Competence[] {
  const result: Competence[] = [];
  for (let c = from; c <= to; c = addMonths(c, 1)) result.push(c);
  return result;
}

/** Vencimento da competência no dia `dueDay` (limitado ao último dia do mês). */
export function dueDateFor(competence: Competence, dueDay: number): ISODate {
  const { year, month } = parseCompetence(competence);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)
    throw new DateError(`Dia de vencimento inválido: ${dueDay}.`);
  return `${year}-${pad(month)}-${pad(Math.min(dueDay, daysInMonth(year, month)))}`;
}

/** Data de hoje no fuso de Brasília (referência para vencimentos). */
export function todayInBrazil(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-12-10" → "10/12/2026" */
export function formatDateBR(date: ISODate): string {
  assertISODate(date);
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** "2026-12" → "dez/2026" */
export function formatCompetence(competence: Competence): string {
  const { year, month } = parseCompetence(competence);
  return `${MONTHS[month - 1]}/${year}`;
}
