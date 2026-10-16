import { describe, expect, it } from "vitest";
import {
  canEditOwnField,
  canViewParticipant,
  hasPermission,
  PERMISSIONS,
  type Actor,
} from "@/modules/auth/permissions";

const admin: Actor = { userId: "u-admin", role: "ADMIN", status: "ACTIVE", participantId: null };
const joao: Actor = { userId: "u-joao", role: "PARTICIPANT", status: "ACTIVE", participantId: "p-joao" };
const owner: Actor = { ...joao, caixinhaRole: "OWNER", participantId: null };
const maria: Actor = { userId: "u-maria", role: "PARTICIPANT", status: "ACTIVE", participantId: "p-maria" };
const suspended: Actor = { ...admin, status: "SUSPENDED" };

const ADMIN_ONLY = PERMISSIONS.filter(
  (p) => !p.startsWith("self.") && p !== "reports.collective" && p !== "announcements.read",
);

describe("matriz de permissões", () => {
  it("administrador tem todas as permissões", () => {
    for (const p of PERMISSIONS) expect(hasPermission(admin, p), p).toBe(true);
  });

  it.each(ADMIN_ONLY)("participante NÃO tem %s", (permission) => {
    expect(hasPermission(joao, permission)).toBe(false);
  });

  it("participante tem acesso ao próprio painel, extrato e recibos", () => {
    expect(hasPermission(joao, "self.dashboard")).toBe(true);
    expect(hasPermission(joao, "self.statement")).toBe(true);
    expect(hasPermission(joao, "self.receipts")).toBe(true);
    expect(hasPermission(joao, "reports.collective")).toBe(true);
  });

  it("participante não confirma pagamentos nem lança no livro-caixa", () => {
    expect(hasPermission(joao, "payments.confirm")).toBe(false);
    expect(hasPermission(joao, "expenses.manage")).toBe(false);
    expect(hasPermission(joao, "ledger.read")).toBe(false);
  });

  it("responsável administra somente quando a caixinha ativa lhe dá esse papel", () => {
    for (const p of ADMIN_ONLY) expect(hasPermission(owner, p), p).toBe(true);
    expect(hasPermission({ ...owner, caixinhaRole: "PARTICIPANT" }, "dashboard.admin")).toBe(false);
    expect(hasPermission({ ...owner, twoFactorPending: true }, "payments.confirm")).toBe(false);
  });

  it("usuário suspenso não tem nenhuma permissão", () => {
    for (const p of PERMISSIONS) expect(hasPermission(suspended, p), p).toBe(false);
  });

  it("administrador sem verificação em duas etapas fica só com permissões de participante", () => {
    const pending: Actor = { ...admin, participantId: "p-admin", twoFactorPending: true };
    for (const p of ADMIN_ONLY) expect(hasPermission(pending, p), p).toBe(false);
    expect(hasPermission(pending, "self.dashboard")).toBe(true);
    expect(hasPermission(pending, "reports.collective")).toBe(true);
    expect(hasPermission({ ...pending, twoFactorPending: false }, "payments.confirm")).toBe(true);
    // Nem dados individuais de outros participantes (comprovantes, recibos).
    expect(canViewParticipant(pending, "p-joao")).toBe(false);
    expect(canViewParticipant(pending, "p-admin")).toBe(true);
  });

  it("sem sessão, nada é permitido", () => {
    expect(hasPermission(null, "self.dashboard")).toBe(false);
    expect(canViewParticipant(null, "p-joao")).toBe(false);
  });
});

describe("isolamento entre participantes", () => {
  it("participante vê apenas os próprios dados", () => {
    expect(canViewParticipant(joao, "p-joao")).toBe(true);
    expect(canViewParticipant(joao, "p-maria")).toBe(false);
    expect(canViewParticipant(maria, "p-joao")).toBe(false);
  });

  it("participante sem cadastro vinculado não vê ninguém", () => {
    expect(canViewParticipant({ ...joao, participantId: null }, "p-joao")).toBe(false);
  });

  it("administrador vê qualquer participante", () => {
    expect(canViewParticipant(admin, "p-joao")).toBe(true);
  });
});

describe("edição dos próprios dados", () => {
  it("participante só altera campos pessoais liberados", () => {
    expect(canEditOwnField(joao, "phone")).toBe(true);
    for (const field of ["quotaCount", "amountCents", "status", "role", "email", "fullName"]) {
      expect(canEditOwnField(joao, field), field).toBe(false);
    }
  });
});
