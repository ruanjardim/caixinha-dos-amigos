/**
 * BR Code do Pix (padrão EMV/QRCPS do Banco Central): texto "copia e cola" e conteúdo do QR Code.
 * Puro e testável. Formato TLV: ID (2) + tamanho (2) + valor; termina com CRC16-CCITT (0xFFFF, 0x1021).
 */
import { assertCents, type Cents } from "./money";

export class PixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PixError";
  }
}

export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new PixError(`Campo ${id} longo demais.`);
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** Remove acentos e caracteres fora do conjunto permitido; limita o tamanho. */
export function sanitizePixText(text: string, max: number): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // marcas de acento após a decomposição NFD
    .replace(/[^A-Za-z0-9 ./\-]/g, "")
    .trim()
    .slice(0, max);
}

/** txid: até 25 caracteres alfanuméricos; "***" quando não há identificação. */
export function sanitizeTxid(txid: string | null | undefined): string {
  const clean = (txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return clean || "***";
}

export function formatPixAmount(cents: Cents): string {
  assertCents(cents);
  if (cents <= 0) throw new PixError("Valor do Pix deve ser maior que zero.");
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export type PixPayloadInput = {
  key: string;
  merchantName: string;
  merchantCity: string;
  amountCents?: Cents | null;
  txid?: string | null;
  description?: string | null;
};

export function buildPixPayload(input: PixPayloadInput): string {
  const key = input.key.trim();
  if (!key) throw new PixError("Chave Pix não informada.");
  const name = sanitizePixText(input.merchantName, 25);
  const city = sanitizePixText(input.merchantCity, 15);
  if (!name || !city) throw new PixError("Nome e cidade do recebedor são obrigatórios.");

  const description = input.description ? sanitizePixText(input.description, 40) : "";
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", key) + (description ? tlv("02", description) : "");

  const body =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (input.amountCents ? tlv("54", formatPixAmount(input.amountCents)) : "") +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    tlv("62", tlv("05", sanitizeTxid(input.txid))) +
    "6304";
  return body + crc16(body);
}

/** Lê os campos de primeiro nível de um BR Code e confere o CRC. */
export function parsePixPayload(payload: string): { fields: Record<string, string>; crcValid: boolean } {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || Number.isNaN(len)) throw new PixError("BR Code malformado.");
    fields[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  const crcValid = fields["63"] === crc16(payload.slice(0, payload.length - 4));
  return { fields, crcValid };
}

export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

/** Identifica o tipo de chave Pix (formatos do DICT). Retorna null se não for uma chave válida. */
export function detectPixKeyType(raw: string): PixKeyType | null {
  const key = raw.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "EVP";
  if (/^\+55\d{10,11}$/.test(key)) return "PHONE";
  if (key.length <= 77 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return "EMAIL";
  const digits = key.replace(/[.\-/]/g, "");
  if (/^\d{11}$/.test(digits)) return "CPF";
  if (/^\d{14}$/.test(digits)) return "CNPJ";
  return null;
}

/**
 * Chave aceita como destino dos recursos coletivos.
 * CPF identifica conta de pessoa física: nunca é aceito como destino padrão da caixinha.
 * (E-mail, telefone e chave aleatória não revelam o titular — a responsabilidade fica documentada.)
 */
export function assertCollectiveKey(raw: string): PixKeyType {
  const type = detectPixKeyType(raw);
  if (!type) throw new PixError("Chave Pix inválida. Use CNPJ, e-mail, telefone (+55...) ou chave aleatória.");
  if (type === "CPF") {
    throw new PixError(
      "Chave do tipo CPF indica conta de pessoa física. Use uma chave da conta da caixinha (estrutura jurídica própria).",
    );
  }
  return type;
}
