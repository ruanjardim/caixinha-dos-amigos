/**
 * Validação dos formulários exatamente como o navegador envia (FormData → texto).
 * Campos de checkbox desmarcados NÃO são enviados; campos vazios chegam como "".
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { caixinhaSchema } from "@/modules/caixinhas/schemas";
import {
  acceptRulesSchema,
  cycleSchema,
  leaveSchema,
  membershipSchema,
  quotaChangeSchema,
} from "@/modules/cycles/schemas";
import { manualEntrySchema, reverseEntrySchema } from "@/modules/ledger/schemas";
import { ownProfileSchema, participantSchema, setStatusSchema } from "@/modules/participants/schemas";
import {
  confirmPaymentSchema,
  editPaymentSchema,
  informPaymentSchema,
  registerPaymentSchema,
  rejectPaymentSchema,
  reversePaymentSchema,
} from "@/modules/payments/schemas";

const fieldsWithErrors = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.path.join("."));

describe("caixinha", () => {
  it("normaliza campos vazios e limita o nome", () => {
    expect(caixinhaSchema.parse({ name: "Amigos do Bairro", description: "" })).toEqual({
      name: "Amigos do Bairro",
      description: null,
    });
    expect(caixinhaSchema.safeParse({ name: "AB", description: "" }).success).toBe(false);
    expect(caixinhaSchema.safeParse({ name: "Grupo", description: "x".repeat(301) }).success).toBe(false);
  });
});

describe("participante", () => {
  const ok = {
    fullName: "Maria da Silva",
    email: " Maria@Exemplo.COM ",
    phone: "(11) 91234-5678",
    joinedAt: "2026-12-01",
  };

  it("normaliza e-mail e telefone", () => {
    const r = participantSchema.parse(ok);
    expect(r.email).toBe("maria@exemplo.com");
    expect(r.phone).toBe("11912345678");
  });

  it("telefone é opcional", () => {
    expect(participantSchema.parse({ ...ok, phone: "" }).phone).toBeNull();
  });

  it("exige nome e sobrenome, e-mail e data válidos", () => {
    const r = participantSchema.safeParse({ fullName: "Maria", email: "x", phone: "123", joinedAt: "2026-02-30" });
    expect(fieldsWithErrors(r).sort()).toEqual(["email", "fullName", "joinedAt", "phone"]);
  });

  it("situação e perfil", () => {
    expect(setStatusSchema.safeParse({ id: "x", status: "ACTIVE", reason: "" }).success).toBe(false);
    expect(setStatusSchema.safeParse({ id: "x", status: "LEFT", reason: "ok" }).success).toBe(false);
    expect(ownProfileSchema.parse({ phone: "11 3333-4444" }).phone).toBe("1133334444");
  });
});

describe("ciclo", () => {
  const ok = {
    name: "Ciclo 2026/2027",
    startDate: "2026-12-01",
    contributionEndDate: "2027-11-30",
    settlementDate: "2027-12-15",
    dueDay: "10",
    adminFeePercent: "10",
    quotaValues: "50; 100",
    rulesText: "",
  };

  it("converte cotas e percentual para centavos e pontos-base", () => {
    const r = cycleSchema.parse(ok);
    expect(r.quotaValues).toEqual([5_000, 10_000]);
    expect(r.adminFeePercent).toBe(1_000);
    expect(r.dueDay).toBe(10);
  });

  it("aceita percentual decimal e cotas repetidas/fora de ordem", () => {
    const r = cycleSchema.parse({ ...ok, adminFeePercent: "7,5", quotaValues: "100 / 50,00; 100" });
    expect(r.adminFeePercent).toBe(750);
    expect(r.quotaValues).toEqual([5_000, 10_000]);
  });

  it("rejeita datas fora de ordem, vencimento > 28 e percentual > 50%", () => {
    const r = cycleSchema.safeParse({ ...ok, contributionEndDate: "2026-11-01", dueDay: "31", adminFeePercent: "60" });
    expect(fieldsWithErrors(r).sort()).toEqual(["adminFeePercent", "contributionEndDate", "dueDay"]);
  });

  it("participação, alteração de cotas e saída", () => {
    expect(
      membershipSchema.parse({ participantId: "p", quotaCount: "2", quotaValueCents: "5000", joinedAt: "2026-12-01" }),
    ).toMatchObject({
      quotaCount: 2,
      quotaValueCents: 5_000,
    });
    expect(
      membershipSchema.safeParse({ participantId: "p", quotaCount: "0", quotaValueCents: "", joinedAt: "2026-12-01" })
        .success,
    ).toBe(false);
    expect(
      quotaChangeSchema.safeParse({ quotaCount: "3", quotaValueCents: "5000", effectiveFrom: "2027-13", reason: "x" })
        .success,
    ).toBe(false);
    expect(leaveSchema.safeParse({ leftAt: "2027-06-15", reason: "" }).success).toBe(false);
  });

  it("aceite das regras exige a caixa marcada", () => {
    expect(acceptRulesSchema.safeParse({ cycleId: "c" }).success).toBe(false);
    expect(acceptRulesSchema.safeParse({ cycleId: "c", agree: "on" }).success).toBe(true);
  });
});

describe("pagamentos", () => {
  const base = () => ({
    membershipId: "m1",
    amountCents: "100,00",
    receivedAt: "2026-12-05",
    method: "PIX_MANUAL",
    transactionRef: "e2e 1234 abc",
    notes: "",
    idempotencyKey: randomUUID(),
  });

  it("informado pelo participante, SEM a caixa de duplicidade (desmarcada não é enviada)", () => {
    const r = informPaymentSchema.parse(base());
    expect(r).toMatchObject({
      amountCents: 10_000,
      transactionRef: "E2E1234ABC",
      acknowledgeDuplicate: false,
      notes: null,
    });
  });

  it("caixa de duplicidade marcada", () => {
    expect(informPaymentSchema.parse({ ...base(), acknowledgeDuplicate: "on" }).acknowledgeDuplicate).toBe(true);
  });

  it("registro pela administração: 'confirmar agora' opcional", () => {
    expect(registerPaymentSchema.parse(base()).confirmNow).toBe(false);
    expect(registerPaymentSchema.parse({ ...base(), confirmNow: "on" }).confirmNow).toBe(true);
  });

  it("Pix e transferência exigem referência; dinheiro não", () => {
    expect(fieldsWithErrors(registerPaymentSchema.safeParse({ ...base(), transactionRef: "" }))).toEqual([
      "transactionRef",
    ]);
    expect(registerPaymentSchema.safeParse({ ...base(), method: "CASH", transactionRef: "" }).success).toBe(true);
  });

  it("rejeita valor zero, forma desconhecida e formulário sem chave", () => {
    const r = informPaymentSchema.safeParse({ ...base(), amountCents: "0,00", method: "BITCOIN", idempotencyKey: "x" });
    expect(fieldsWithErrors(r).sort()).toEqual(["amountCents", "idempotencyKey", "method"]);
  });

  it("conferência: confirmar, recusar, estornar e corrigir", () => {
    expect(
      confirmPaymentSchema.parse({ paymentId: "p", receivedAt: "2026-12-05", confirmationNote: "" }).confirmationNote,
    ).toBeNull();
    expect(rejectPaymentSchema.safeParse({ paymentId: "p", reason: " " }).success).toBe(false);
    expect(
      reversePaymentSchema.safeParse({ paymentId: "p", reversedAt: "2026-12-06", reason: "Pix devolvido" }).success,
    ).toBe(true);
    expect(editPaymentSchema.parse({ ...base(), paymentId: "p" }).amountCents).toBe(10_000);
  });
});

describe("livro-caixa", () => {
  it("lançamento manual", () => {
    expect(
      manualEntrySchema.parse({
        cycleId: "c",
        kind: "EXPENSE",
        amountCents: "25,90",
        occurredOn: "2026-12-19",
        description: "Tarifa",
      }),
    ).toMatchObject({ amountCents: 2_590 });
    expect(
      manualEntrySchema.safeParse({
        cycleId: "c",
        kind: "CONTRIBUTION",
        amountCents: "1",
        occurredOn: "2026-12-19",
        description: "x",
      }).success,
    ).toBe(false);
  });

  it("estorno exige motivo", () => {
    expect(reverseEntrySchema.safeParse({ transactionId: "t", occurredOn: "2026-12-20", reason: "" }).success).toBe(
      false,
    );
  });
});
