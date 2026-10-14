-- =============================================================================
-- Partidas dobradas: verificação IMEDIATA (por comando) em vez de adiada.
--
-- Todas as linhas de um lançamento devem ser inseridas em um ÚNICO comando
-- (a aplicação usa createMany). Ao fim de cada INSERT, o gatilho confere se
-- cada lançamento afetado soma zero. Mais previsível que uma restrição adiada
-- e compatível com o Postgres embutido usado em desenvolvimento.
-- =============================================================================

DROP TRIGGER IF EXISTS ledger_line_balanced ON "ledger_line";
DROP FUNCTION IF EXISTS caixinha_check_ledger_balance();

CREATE OR REPLACE FUNCTION caixinha_check_ledger_balance_stmt() RETURNS trigger AS $$
DECLARE
  bad record;
BEGIN
  SELECT t."transactionId" AS id, SUM(l."amountCents") AS total
    INTO bad
    FROM (SELECT DISTINCT "transactionId" FROM new_lines) AS t
    JOIN "ledger_line" AS l ON l."transactionId" = t."transactionId"
   GROUP BY t."transactionId"
  HAVING SUM(l."amountCents") <> 0
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Lançamento % desbalanceado: soma das linhas = % centavos.', bad.id, bad.total
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION caixinha_check_ledger_balance_stmt() SET search_path FROM CURRENT;

CREATE TRIGGER ledger_line_balanced
  AFTER INSERT ON "ledger_line"
  REFERENCING NEW TABLE AS new_lines
  FOR EACH STATEMENT EXECUTE FUNCTION caixinha_check_ledger_balance_stmt();
