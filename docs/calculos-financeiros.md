# Cálculos financeiros

> Status: **especificação**. Utilitários de dinheiro implementados e testados (`src/domain/money.ts`).
> Cálculo de parcelas na Fase 2; apuração e distribuição na Fase 4.

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

Pagamentos são **alocados às parcelas em ordem cronológica**. O que exceder as parcelas vencidas cobre as
próximas (antecipação). Pagamento parcial deixa a parcela parcialmente coberta.

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

Para cada participante *i*, considerando somente pagamentos **confirmados**, pela **data de crédito**:

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

| | Ana (antecipou tudo) | Bruno (R$ 100 todo dia 1º) |
| --- | --- | --- |
| Total pago | R$ 1.200 em 01/12/2026 | 12 × R$ 100 |
| Peso (R$·dia) | 1.200 × 365 = 438.000 | 100 × (365+334+303+275+244+214+183+153+122+91+61+30) = 237.500 |
| Participação | 64,84% | 35,16% |
| Valor bruto | R$ 816,9948 | R$ 443,0052 |
| **Valor final** | **R$ 816,99** | **R$ 443,01** (maior resto recebe o centavo) |

Total: R$ 1.260,00. Os dois contribuíram com o mesmo valor; Ana recebe mais porque o dinheiro dela ficou disponível
por mais tempo, conforme as regras aprovadas.

## Decisões pendentes (ver roadmap)

Tratamento de resultado negativo; data de corte; antecipação antes do início do ciclo; data de referência
(crédito × confirmação); saída no meio do ciclo; mudança de cotas no meio do ciclo.
