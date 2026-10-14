/**
 * Verifica as proteções de integridade aplicadas no PRÓPRIO banco de dados
 * (gatilhos e restrições das migrations), contra o banco de TESTES.
 *
 * Cada verificação é um comando isolado (sem BEGIN/ROLLBACK longos): o Postgres
 * embutido de desenvolvimento compartilha a sessão entre conexões, e uma
 * transação aberta aqui afetaria outros testes.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
const client = new Client({ connectionString: url });
const s = randomUUID().slice(0, 8); // sufixo único dos registros deste teste
const id = (name: string) => `${name}-${s}`;

async function expectDbError(sql: string, params: unknown[], message: RegExp) {
  const error = await client.query(sql, params).then(
    () => null,
    (e: Error) => e,
  );
  expect(error, "era esperado um erro do banco, mas a operação foi aceita").not.toBeNull();
  expect(error!.message).toMatch(message);
}

describe.skipIf(!url)("integridade no banco de dados", () => {
  beforeAll(async () => {
    await client.connect();
    await client.query(`INSERT INTO "user" (id, name, email, "updatedAt") VALUES ($1, 'Teste', $2, now())`, [
      id("user"),
      `${id("user")}@t.local`,
    ]);
    await client.query(
      `INSERT INTO cycle (id, name, "startDate", "contributionEndDate", "settlementDate", status, "updatedAt")
       VALUES ($1, 'Aberto', '2026-12-01', '2027-11-30', '2027-12-15', 'OPEN', now()),
              ($2, 'Encerrado', '2025-12-01', '2026-11-30', '2026-12-15', 'CLOSED', now()),
              ($3, 'Rascunho', '2027-12-01', '2028-11-30', '2028-12-15', 'DRAFT', now())`,
      [id("open"), id("closed"), id("draft")],
    );
    await client.query(
      `INSERT INTO participant (id, "fullName", email, "joinedAt", "updatedAt") VALUES ($1, 'P', $2, '2026-12-01', now())`,
      [id("p"), `${id("p")}@t.local`],
    );
    await client.query(
      `INSERT INTO membership (id, "participantId", "cycleId", "quotaCount", "quotaValueCents", "joinedAt", "updatedAt")
       VALUES ($1, $2, $3, 2, 5000, '2026-12-01', now())`,
      [id("m"), id("p"), id("open")],
    );
  });

  afterAll(async () => {
    await client.end();
  });

  const ledgerTx = (txId: string, cycleId: string, postClosing = false) =>
    client.query(
      `INSERT INTO ledger_transaction (id, "cycleId", "occurredOn", category, description, "createdById", "postClosing")
       VALUES ($1, $2, '2026-12-05', 'CONTRIBUTION', 'teste', $3, $4)`,
      [txId, cycleId, id("user"), postClosing],
    );

  it("aceita lançamento balanceado (soma zero)", async () => {
    await ledgerTx(id("bal"), id("open"));
    await client.query(
      `INSERT INTO ledger_line (id, "transactionId", account, "amountCents")
       VALUES ($1, $3, 'CASH', 10000), ($2, $3, 'PARTICIPANT_PRINCIPAL', -10000)`,
      [id("l1"), id("l2"), id("bal")],
    );
  });

  it("rejeita lançamento desbalanceado", async () => {
    await ledgerTx(id("unbal"), id("open"));
    await expectDbError(
      `INSERT INTO ledger_line (id, "transactionId", account, "amountCents")
       VALUES ($1, $3, 'CASH', 10000), ($2, $3, 'PARTICIPANT_PRINCIPAL', -9999)`,
      [id("l3"), id("l4"), id("unbal")],
      /desbalanceado/,
    );
  });

  it("linhas e lançamentos do livro-caixa não podem ser alterados nem apagados", async () => {
    await expectDbError(`UPDATE ledger_line SET "amountCents" = 1 WHERE id = $1`, [id("l1")], /somente-inclusão/);
    await expectDbError(`DELETE FROM ledger_line WHERE id = $1`, [id("l1")], /somente-inclusão/);
    await expectDbError(`DELETE FROM ledger_transaction WHERE id = $1`, [id("bal")], /somente-inclusão/);
  });

  it("auditoria é somente-inclusão", async () => {
    await client.query(`INSERT INTO audit_log (id, action, "entityType") VALUES ($1, 'teste', 'Teste')`, [id("audit")]);
    await expectDbError(`UPDATE audit_log SET action = 'x' WHERE id = $1`, [id("audit")], /somente-inclusão/);
    await expectDbError(`DELETE FROM audit_log WHERE id = $1`, [id("audit")], /somente-inclusão/);
  });

  it("ciclo encerrado não aceita lançamentos comuns, só o procedimento pós-encerramento", async () => {
    await expectDbError(
      `INSERT INTO ledger_transaction (id, "cycleId", "occurredOn", category, description, "createdById")
       VALUES ($1, $2, '2026-12-05', 'ADJUSTMENT', 'x', $3)`,
      [id("x"), id("closed"), id("user")],
      /Ciclo encerrado/,
    );
    await ledgerTx(id("post"), id("closed"), true); // aceito
  });

  it("ciclo em rascunho não aceita lançamentos", async () => {
    await expectDbError(
      `INSERT INTO ledger_transaction (id, "cycleId", "occurredOn", category, description, "createdById")
       VALUES ($1, $2, '2027-12-05', 'ADJUSTMENT', 'x', $3)`,
      [id("y"), id("draft"), id("user")],
      /rascunho/,
    );
  });

  it("regras congeladas não podem ser alteradas", async () => {
    await client.query(
      `INSERT INTO cycle_rules (id, "cycleId", version, "quotaValuesCents", "rulesText", "frozenAt")
       VALUES ($1, $2, 1, '{5000,10000}', 'Regras', now())`,
      [id("rules"), id("open")],
    );
    await expectDbError(`UPDATE cycle_rules SET "adminFeeBps" = 2000 WHERE id = $1`, [id("rules")], /congeladas/);
  });

  it("pagamentos não podem ser apagados e não aceitam valor zero", async () => {
    await client.query(
      `INSERT INTO payment (id, "membershipId", "amountCents", method, "transactionRef", "updatedAt")
       VALUES ($1, $2, 10000, 'PIX_MANUAL', $3, now())`,
      [id("pay"), id("m"), `E${s}`],
    );
    await expectDbError(`DELETE FROM payment WHERE id = $1`, [id("pay")], /Exclusão definitiva/);
    await expectDbError(
      `INSERT INTO payment (id, "membershipId", "amountCents", method, "updatedAt") VALUES ($1, $2, 0, 'CASH', now())`,
      [id("pay0"), id("m")],
      /payment_amount_positive/,
    );
  });

  it("impede registrar duas vezes a mesma transação (anti-duplicidade)", async () => {
    await expectDbError(
      `INSERT INTO payment (id, "membershipId", "amountCents", method, "transactionRef", "updatedAt")
       VALUES ($1, $2, 10000, 'PIX_MANUAL', $3, now())`,
      [id("pay2"), id("m"), `E${s}`],
      /duplicate key|unique/i,
    );
  });

  it("pagamento não nasce confirmado sem data e responsável, nem pula etapas", async () => {
    await expectDbError(
      `INSERT INTO payment (id, "membershipId", "amountCents", method, status, "updatedAt")
       VALUES ($1, $2, 100, 'CASH', 'CONFIRMED', now())`,
      [id("pay3"), id("m")],
      /exige data de crédito/,
    );
    await expectDbError(
      `UPDATE payment SET status = 'REVERSED' WHERE id = $1`,
      [id("pay")],
      /Transição de status inválida/,
    );
  });

  it("recursos sensíveis começam desligados", async () => {
    const { rows } = await client.query(`SELECT key, enabled FROM feature_flag ORDER BY key`);
    expect(rows).toEqual([
      { key: "ADMIN_PAYOUT_ENABLED", enabled: false },
      { key: "PIX_LIVE_ENABLED", enabled: false },
      { key: "RAFFLE_SALES_ENABLED", enabled: false },
    ]);
  });
});
