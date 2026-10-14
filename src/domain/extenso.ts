/**
 * Valor em reais por extenso (para recibos): 123456 → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos".
 * Suporta até R$ 999.999.999,99.
 */
import { assertCents, MoneyError, type Cents } from "./money";

const UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const TEENS = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

/** 1–999 por extenso. */
function upTo999(n: number): string {
  if (n === 100) return "cem";
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]);
  else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    if (t) parts.push(TENS[t]);
    if (u) parts.push(UNITS[u]);
  }
  return parts.join(" e ");
}

/** Conector entre grupos: "e" quando o grupo seguinte é < 100 ou centena redonda ("mil e quinhentos"). */
function joinGroups(parts: { text: string; value: number }[]): string {
  return parts.reduce((acc, part, index) => {
    if (index === 0) return part.text;
    const connector = part.value < 100 || part.value % 100 === 0 ? " e " : " ";
    return `${acc}${connector}${part.text}`;
  }, "");
}

export function integerToWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new MoneyError(`Número inválido: ${n}.`);
  if (n === 0) return "zero";
  if (n > 999_999_999) throw new MoneyError("Valor acima do limite para escrita por extenso.");

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const units = n % 1000;
  const parts: { text: string; value: number }[] = [];
  if (millions)
    parts.push({ text: `${upTo999(millions)} ${millions === 1 ? "milhão" : "milhões"}`, value: millions * 1_000_000 });
  if (thousands) parts.push({ text: thousands === 1 ? "mil" : `${upTo999(thousands)} mil`, value: thousands * 1000 });
  if (units) parts.push({ text: upTo999(units), value: units });
  return joinGroups(parts);
}

export function brlToWords(cents: Cents): string {
  assertCents(cents);
  if (cents < 0) throw new MoneyError("Valor negativo não pode ser escrito por extenso.");
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;

  const parts: string[] = [];
  if (reais > 0) {
    // "um milhão de reais", "dois milhões de reais" (milhão redondo leva "de").
    const roundMillion = reais >= 1_000_000 && reais % 1_000_000 === 0;
    parts.push(`${integerToWords(reais)}${roundMillion ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) parts.push(`${integerToWords(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  if (parts.length === 0) return "zero real";
  return parts.join(" e ");
}
