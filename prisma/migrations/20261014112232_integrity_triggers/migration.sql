-- =============================================================================
-- Proteções de integridade aplicadas no próprio banco de dados.
-- Mesmo que a aplicação tenha um bug, estas regras não podem ser violadas.
-- =============================================================================

-- 1) Tabelas append-only: bloqueia UPDATE e DELETE.
CREATE OR REPLACE FUNCTION caixinha_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tabela % é somente-inclusão: % não é permitido. Use um lançamento de reversão.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_change();

CREATE TRIGGER ledger_transaction_append_only
  BEFORE UPDATE OR DELETE ON "ledger_transaction"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_change();

CREATE TRIGGER ledger_line_append_only
  BEFORE UPDATE OR DELETE ON "ledger_line"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_change();

-- Pagamentos nunca são apagados (cancelamento/estorno mudam o status).
CREATE OR REPLACE FUNCTION caixinha_forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Exclusão definitiva não é permitida em %.', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_no_delete
  BEFORE DELETE ON "payment"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_delete();

CREATE TRIGGER payment_allocation_no_delete
  BEFORE DELETE ON "payment_allocation"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_delete();

-- 2) Partidas dobradas: a soma das linhas de cada lançamento deve ser zero.
--    Verificado ao final da transação (DEFERRABLE INITIALLY DEFERRED).
CREATE OR REPLACE FUNCTION caixinha_check_ledger_balance() RETURNS trigger AS $$
DECLARE
  total bigint;
BEGIN
  SELECT COALESCE(SUM("amountCents"), 0) INTO total
    FROM "ledger_line" WHERE "transactionId" = NEW."transactionId";
  IF total <> 0 THEN
    RAISE EXCEPTION 'Lançamento % desbalanceado: soma das linhas = % centavos.',
      NEW."transactionId", total
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_line_balanced
  AFTER INSERT ON "ledger_line"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION caixinha_check_ledger_balance();

-- 3) Ciclo encerrado: novos lançamentos só pelo procedimento pós-encerramento.
CREATE OR REPLACE FUNCTION caixinha_check_cycle_open() RETURNS trigger AS $$
DECLARE
  st text;
BEGIN
  SELECT "status"::text INTO st FROM "cycle" WHERE "id" = NEW."cycleId";
  IF st = 'CLOSED' AND NOT NEW."postClosing" THEN
    RAISE EXCEPTION 'Ciclo encerrado: use o procedimento de correção pós-encerramento.'
      USING ERRCODE = 'P0001';
  END IF;
  IF st = 'DRAFT' THEN
    RAISE EXCEPTION 'Ciclo em rascunho não aceita lançamentos financeiros.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_transaction_cycle_status
  BEFORE INSERT ON "ledger_transaction"
  FOR EACH ROW EXECUTE FUNCTION caixinha_check_cycle_open();

-- 4) Regras congeladas são imutáveis.
CREATE OR REPLACE FUNCTION caixinha_frozen_rules() RETURNS trigger AS $$
BEGIN
  IF OLD."frozenAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Regras do ciclo já congeladas (versão %). Crie uma nova versão.', OLD."version"
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cycle_rules_frozen
  BEFORE UPDATE OR DELETE ON "cycle_rules"
  FOR EACH ROW EXECUTE FUNCTION caixinha_frozen_rules();

-- 5) Apuração aprovada é imutável (só pode ser marcada como SUPERSEDED).
CREATE OR REPLACE FUNCTION caixinha_approved_result() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'APPROVED' AND NOT (
       TG_OP = 'UPDATE' AND NEW."status" = 'SUPERSEDED'
       AND NEW."netResultCents" = OLD."netResultCents"
       AND NEW."distributableCents" = OLD."distributableCents"
       AND NEW."contentHash" = OLD."contentHash") THEN
    RAISE EXCEPTION 'Apuração aprovada não pode ser alterada.'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER result_calculation_approved
  BEFORE UPDATE OR DELETE ON "result_calculation"
  FOR EACH ROW EXECUTE FUNCTION caixinha_approved_result();

-- 6) Valores básicos sempre positivos.
ALTER TABLE "payment" ADD CONSTRAINT payment_amount_positive CHECK ("amountCents" > 0);
ALTER TABLE "payment_allocation" ADD CONSTRAINT allocation_amount_positive CHECK ("amountCents" > 0);
ALTER TABLE "membership" ADD CONSTRAINT membership_quota_positive CHECK ("quotaCount" > 0 AND "quotaValueCents" > 0);
ALTER TABLE "installment" ADD CONSTRAINT installment_expected_positive CHECK ("expectedCents" > 0);
ALTER TABLE "cycle" ADD CONSTRAINT cycle_due_day CHECK ("dueDay" BETWEEN 1 AND 28);
ALTER TABLE "cycle" ADD CONSTRAINT cycle_dates CHECK ("startDate" <= "contributionEndDate" AND "contributionEndDate" <= "settlementDate");
ALTER TABLE "cycle_rules" ADD CONSTRAINT rules_admin_fee CHECK ("adminFeeBps" BETWEEN 0 AND 10000);
ALTER TABLE "result_calculation" ADD CONSTRAINT result_admin_fee_nonneg CHECK ("adminFeeCents" >= 0 AND "distributableCents" >= 0);

-- 7) Feature flags sensíveis começam desligadas.
INSERT INTO "feature_flag" ("key", "enabled", "justification", "updatedAt") VALUES
  ('RAFFLE_SALES_ENABLED', false, 'Desativado por padrão: depende de validação jurídica.', NOW()),
  ('PIX_LIVE_ENABLED', false, 'Desativado por padrão: depende de estrutura jurídica e conta adequada.', NOW()),
  ('ADMIN_PAYOUT_ENABLED', false, 'Desativado por padrão: depende de validação jurídica e tributária.', NOW());
