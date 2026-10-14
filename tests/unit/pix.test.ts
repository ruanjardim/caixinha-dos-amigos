import { describe, expect, it } from "vitest";
import {
  assertCollectiveKey,
  buildPixPayload,
  crc16,
  detectPixKeyType,
  formatPixAmount,
  parsePixPayload,
  PixError,
  sanitizePixText,
  sanitizeTxid,
} from "@/domain/pix";

describe("BR Code do Pix", () => {
  it("reproduz o exemplo oficial do Manual de Padrões do Pix (Banco Central)", () => {
    const payload = buildPixPayload({
      key: "123e4567-e12b-12d1-a456-426655440000",
      merchantName: "Fulano de Tal",
      merchantCity: "BRASILIA",
    });
    expect(payload).toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
    );
  });

  it("CRC16-CCITT confere com o valor de referência", () => {
    expect(crc16("123456789")).toBe("29B1"); // vetor clássico do CRC-16/CCITT-FALSE
  });

  it("inclui valor e identificador da cobrança, e o CRC fecha", () => {
    const payload = buildPixPayload({
      key: "caixinha@exemplo.org",
      merchantName: "Caixinha dos Amigos",
      merchantCity: "São Paulo",
      amountCents: 10_050,
      txid: "CX-2026-0001",
    });
    const { fields, crcValid } = parsePixPayload(payload);
    expect(crcValid).toBe(true);
    expect(fields["54"]).toBe("100.50");
    expect(fields["60"]).toBe("Sao Paulo");
    expect(sanitizePixText("Contribuição 10/2026", 40)).toBe("Contribuicao 10/2026");
    expect(fields["62"]).toBe("0510CX20260001"); // txid só alfanumérico: "CX20260001"
  });

  it("detecta BR Code adulterado", () => {
    const payload = buildPixPayload({ key: "k", merchantName: "A", merchantCity: "B", amountCents: 100 });
    const tampered = payload.replace("1.00", "9.00");
    expect(parsePixPayload(tampered).crcValid).toBe(false);
  });

  it("limpa textos e limita tamanhos", () => {
    expect(sanitizePixText("Associação Caixinha dos Amigos Unidos", 25)).toBe("Associacao Caixinha dos A");
    expect(sanitizeTxid("abc-123 xyz")).toBe("abc123xyz");
    expect(sanitizeTxid("")).toBe("***");
    expect(sanitizeTxid("x".repeat(40))).toHaveLength(25);
  });

  it("valor sempre positivo e com 2 casas", () => {
    expect(formatPixAmount(5)).toBe("0.05");
    expect(formatPixAmount(120_000)).toBe("1200.00");
    expect(() => formatPixAmount(0)).toThrow(PixError);
  });

  it("exige chave, nome e cidade", () => {
    expect(() => buildPixPayload({ key: " ", merchantName: "A", merchantCity: "B" })).toThrow(PixError);
    expect(() => buildPixPayload({ key: "k", merchantName: "", merchantCity: "B" })).toThrow(PixError);
  });
});

describe("chave Pix da caixinha", () => {
  it("identifica os tipos de chave do DICT", () => {
    expect(detectPixKeyType("123e4567-e12b-12d1-a456-426655440000")).toBe("EVP");
    expect(detectPixKeyType("+5511912345678")).toBe("PHONE");
    expect(detectPixKeyType("caixinha@exemplo.org")).toBe("EMAIL");
    expect(detectPixKeyType("12.345.678/0001-90")).toBe("CNPJ");
    expect(detectPixKeyType("123.456.789-01")).toBe("CPF");
    expect(detectPixKeyType("SIMULACAO-SEM-VALOR-REAL")).toBeNull();
  });

  it("nunca aceita CPF (conta pessoal) como destino padrão dos recursos coletivos", () => {
    expect(() => assertCollectiveKey("123.456.789-01")).toThrow(/pessoa física/);
    expect(() => assertCollectiveKey("chave qualquer")).toThrow(/inválida/);
    expect(assertCollectiveKey("12345678000190")).toBe("CNPJ");
  });
});
