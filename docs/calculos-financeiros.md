# Cálculos financeiros

> Status: **todas as seções implementadas e testadas** (`src/domain/money.ts`, `dates.ts`, `installments.ts`,
> `contributions.ts`, `ledger.ts`, `distribution.ts` — política `v1-2026-10-14`).

## 1. Dinheiro

- Sempre em **centavos inteiros** (`Cents`). Conversão de texto com `parseBRL` (sem float).
- Percentuais em **pontos-base** (1 bp = 0,01%; 10% = 1000 bps). `applyBps` arredonda **para baixo**.

## 2. Cotas e parcelas

```
mensalidade        = quantidade de cotas × valor da cota
previsto no ciclo  = mensalidade × nº de competências do ciclo
pago               = Σ pagamentos CONFIRMED − estornos
pendente           = Σ parcelas vencidas ainda não cobertas
saldo de contribuições = previsto − pago
```

Exemplo: João tem 2 cotas de R$ 50 → mensalidade R$ 100 → previsto em 12 meses R$ 1.200.

**Regra de cobertura (implementada):** o total recebido (somente pagamentos CONFIRMADOS; estornados e recusados não
contam; "em análise" aparece à parte e NÃO cobre parcelas) cobre as parcelas ativas em ordem de competência.

| Situação   | Critério                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Paga       | totalmente coberta                                                                               |
| Antecipada | totalmente coberta e com vencimento ainda no futuro                                              |
| Parcial    | coberta em parte                                                                                 |
| Em atraso  | vencimento **antes** de hoje e não totalmente coberta (o próprio dia do vencimento não é atraso) |
| A vencer   | sem cobertura e vencimento hoje ou no futuro                                                     |

Valor recebido acima do total previsto vira **crédito** (excedente), exibido à parte. "Hoje" é a data no fuso de
Brasília.

Exemplos testados (João, 2 cotas de R$ 50, vencimento dia 10):

- R$ 60 em dezembro → dez/2026 parcial (R$ 40 em aberto).
- R$ 350 em dezembro → dez, jan e fev pagas; mar parcial (R$ 50).
- R$ 1.200 em dezembro → as 12 parcelas cobertas (11 antecipadas).
- Pagamento de R$ 100 estornado → volta a constar como em aberto.

**Alteração de cotas** (ciclo aberto): vale a partir de uma competência cujo vencimento ainda não passou;
parcelas anteriores não mudam. **Saída do ciclo**: parcelas de competências posteriores à saída são canceladas
(registradas, nunca apagadas). **Entrada com ciclo aberto**: parcelas a partir do mês de entrada.

## 3. Resultado líquido

```
resultado líquido = receitas adicionais − despesas − tributos/deduções
```

Contribuições (principal) **nunca** são receita.

## 4. Remuneração administrativa

```
se resultado líquido > 0:  remuneração = applyBps(resultado líquido, adminFeeBps do ciclo)
senão:                     remuneração = 0
distribuível = resultado líquido − remuneração      (se resultado ≤ 0, distribuível = 0)
```

- O percentual é o da versão de regras **congelada** do ciclo.
- Nunca incide sobre o principal.
- Exemplo do enunciado: resultado R$ 1.400, 10% → remuneração R$ 140, distribuível R$ 1.260 (testado).

## 5. Distribuição — saldo diário proporcional

Para cada participante _i_, considerando somente pagamentos **confirmados**, pela **data de crédito**:

```
peso_i  = Σ (valor_pagamento × dias entre o crédito e a data de corte)
        − Σ (valor_estornado × dias entre o estorno e a data de corte)
cota_i  = distribuível × peso_i / Σ pesos
```

- Arredondamento em centavos pelo **método do maior resto**: a soma das cotas é exatamente o distribuível.
- **Trava:** `distribuível ≤ saldo em caixa − principal devido`. Se falhar, a apuração é bloqueada.
- Pesos calculados em `BigInt` (sem risco de overflow).

### Exemplo

Ciclo de 01/12/2026 a 30/11/2027, data de corte 01/12/2027, resultado líquido R$ 1.400, 10% administrativo.

|                 | Ana (antecipou tudo)   | Bruno (R$ 100 todo dia 1º)                                     |
| --------------- | ---------------------- | -------------------------------------------------------------- |
| Total pago      | R$ 1.200 em 01/12/2026 | 12 × R$ 100                                                    |
| Peso (R$·dia)   | 1.200 × 365 = 438.000  | 100 × (365+334+303+275+244+214+183+153+122+91+61+30) = 237.500 |
| Participação    | 64,84%                 | 35,16%                                                         |
| Valor bruto     | R$ 816,9948            | R$ 443,0052                                                    |
| **Valor final** | **R$ 816,99**          | **R$ 443,01** (maior resto recebe o centavo)                   |

Total: R$ 1.260,00. Os dois contribuíram com o mesmo valor; Ana recebe mais porque o dinheiro dela ficou disponível
por mais tempo, conforme as regras aprovadas.

## 6. Decisões do grupo (política v1, 14/10/2026)

| Tema                               | Regra                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data de corte                      | Fim das contribuições. Conta-se até o dia seguinte a ela (exclusivo): crédito em 01/12/2026 e fim em 30/11/2027 = 365 dias                                 |
| Pagamento antes do início do ciclo | Conta dias a partir do início do ciclo                                                                                                                     |
| Estornos e devoluções              | Subtraem a partir da sua data (o valor conta só pelos dias em que ficou na caixinha)                                                                       |
| Pagamento após a data de corte     | Não gera peso; o principal continua devido                                                                                                                 |
| Resultado negativo (prejuízo)      | Sem remuneração administrativa; rateado proporcionalmente ao principal mantido na caixinha na apuração (quem já recebeu o principal ao sair não é cobrado) |
| Saída no meio do ciclo             | Principal devolvido na saída; participa do resultado só pelos dias até a devolução                                                                         |

Essas regras constam do texto padrão das regras (cláusulas 6, 6.1 e 6.2) e são aceitas pelos participantes.

## 7. Fluxo de apuração

1. **Encerrar contribuições** (após a data de fim).
2. Resolver pagamentos em análise, devolver principal de quem saiu, **conciliar o caixa** com o extrato.
3. **Calcular** (rascunho): usa o livro-caixa e as regras congeladas; gera participações e código de integridade
   (SHA-256 do snapshot). Recalcular substitui o rascunho.
4. **Aprovar**: só se nada mudou no livro-caixa desde o cálculo; a apuração fica imutável (gatilho no banco) e o ciclo
   passa a "em distribuição". Só pode haver uma apuração aprovada por ciclo.
5. **Distribuir**: um pagamento por participante (principal + resultado, ou principal − prejuízo), lançado no
   livro-caixa (`PARTICIPANT_PRINCIPAL` + `RESULT_TO_DISTRIBUTE` contra `CASH`).
6. **Remuneração administrativa**: só pode ser paga com o recurso liberado (validação jurídica e tributária). Até lá,
   fica retida no caixa.
7. **Encerrar** quando todos receberam. Depois, só **correções pós-encerramento** (com justificativa ≥ 20
   caracteres, marcadas e auditadas) — que não alteram a apuração aprovada.

### Exemplo verificado no sistema (ciclo de demonstração 2025)

João depositou R$ 2.400 em 05/01/2025 (361 dias → peso 866.400); Maria, R$ 600 em 10/01 e R$ 600 em 10/07
(356 + 175 dias → peso 318.600). Receitas R$ 500, despesas R$ 50 → resultado R$ 450; remuneração 10% = R$ 45;
distribuível R$ 405 → João R$ 296,11 (73,11%), Maria R$ 108,89 (26,89%). Pagamentos: R$ 2.696,11 e R$ 1.308,89.
