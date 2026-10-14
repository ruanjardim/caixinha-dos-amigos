import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import type { Actor } from "@/modules/auth/permissions";
import { checkReceiptAccess } from "@/modules/receipts/policy";
import { ReceiptDocument } from "@/modules/receipts/receipt-document";

const admin: Actor = { userId: "a", role: "ADMIN", status: "ACTIVE", participantId: null };
const joao: Actor = { userId: "j", role: "PARTICIPANT", status: "ACTIVE", participantId: "p-joao" };
const maria: Actor = { userId: "m", role: "PARTICIPANT", status: "ACTIVE", participantId: "p-maria" };

describe("acesso ao recibo", () => {
  const confirmed = { status: "CONFIRMED", participantId: "p-joao" };

  it("dono e administrador baixam o recibo de pagamento confirmado", () => {
    expect(checkReceiptAccess(joao, confirmed).allowed).toBe(true);
    expect(checkReceiptAccess(admin, confirmed).allowed).toBe(true);
  });

  it("outro participante recebe 'não encontrado' (não revela a existência)", () => {
    expect(checkReceiptAccess(maria, confirmed)).toEqual({ allowed: false, reason: "NOT_FOUND" });
    expect(checkReceiptAccess(null, confirmed)).toEqual({ allowed: false, reason: "NOT_FOUND" });
    expect(checkReceiptAccess(joao, null)).toEqual({ allowed: false, reason: "NOT_FOUND" });
  });

  it("pagamento em análise, recusado ou estornado não tem recibo", () => {
    for (const status of ["UNDER_REVIEW", "CANCELLED", "REVERSED", "PENDING"]) {
      expect(checkReceiptAccess(joao, { status, participantId: "p-joao" })).toEqual({
        allowed: false,
        reason: "NOT_CONFIRMED",
      });
    }
  });

  it("usuário suspenso não baixa nada", () => {
    expect(checkReceiptAccess({ ...joao, status: "SUSPENDED" }, confirmed).allowed).toBe(false);
  });
});

describe("PDF do recibo", () => {
  it("gera um PDF válido", async () => {
    const pdf = await renderToBuffer(
      <ReceiptDocument
        r={{
          number: "2026-ABCD1234",
          code: "1A2B-3C4D-5E6F-7A8B",
          participantName: "João Exemplo",
          cycleName: "Ciclo 2026/2027",
          amount: "R$ 100,00",
          amountInWords: "cem reais",
          receivedAt: "14/10/2026",
          method: "Pix",
          transactionRef: "E2E1234",
          confirmedBy: "Ana Administradora",
          confirmedAt: "14/10/2026 09:44",
          issuedAt: "14/10/2026",
        }}
      />,
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 30_000);
});
