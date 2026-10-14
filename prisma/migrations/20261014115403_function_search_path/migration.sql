-- Fixa o search_path das funções de gatilho que consultam tabelas, para que
-- sempre operem no schema em que foram criadas (útil quando o banco usa um
-- schema diferente de "public").
ALTER FUNCTION caixinha_check_ledger_balance() SET search_path FROM CURRENT;
ALTER FUNCTION caixinha_check_cycle_open() SET search_path FROM CURRENT;
