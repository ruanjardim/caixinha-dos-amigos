import { z } from "zod";
import { isISODate } from "@/domain/dates";
import { MoneyError, parseBRL } from "@/domain/money";

/** Valor em reais digitado ("1.234,56") → centavos inteiros e positivos. */
export const moneyField = z
  .string({ error: "Informe o valor." })
  .trim()
  .min(1, "Informe o valor.")
  .transform((value, ctx) => {
    try {
      return parseBRL(value);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof MoneyError ? e.message : "Valor inválido." });
      return z.NEVER;
    }
  })
  .refine((cents) => cents > 0, "O valor deve ser maior que zero.");

/** Data "AAAA-MM-DD" (input type="date"). */
export const dateField = z.string({ error: "Informe a data." }).trim().refine(isISODate, "Data inválida.");

export const competenceField = z
  .string({ error: "Informe a competência." })
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida (use AAAA-MM).");

export const requiredText = (label: string, max = 200) =>
  z
    .string({ error: `Informe ${label}.` })
    .trim()
    .min(1, `Informe ${label}.`)
    .max(max, `Máximo de ${max} caracteres.`);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : null));

export const emailField = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .pipe(z.email("E-mail inválido."));

/** Telefone brasileiro: guarda apenas dígitos (10 ou 11), opcional. */
export const phoneField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/\D/g, "") : ""))
  .refine((v) => v === "" || /^\d{10,11}$/.test(v), "Telefone inválido (DDD + número).")
  .transform((v) => (v === "" ? null : v));

/** Checkbox HTML: ausente no envio quando desmarcado. */
export const checkboxField = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

export const idField = z.string().trim().min(1, "Registro não informado.").max(64);

/** FormData → objeto simples (último valor de cada campo; arquivos ignorados). */
export function formToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) result[key] = value;
  }
  return result;
}
