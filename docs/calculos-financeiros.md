# Cálculos financeiros

> Status: seções 1–2 e livro-caixa **implementados e testados** (Fase 2: `src/domain/money.ts`, `dates.ts`,
> `installments.ts`, `contributions.ts`, `ledger.ts`). Seções 3–5 (apuração e distribuição) serão implementadas na Fase 4.

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

| Situação | Critério |
| --- | --- |
| Paga | totalmente coberta |
| Antecipada | totalmente coberta e com vencimento ainda no futuro |
| Parcial | coberta em parte |
| Em atraso | vencimento **antes** de hoje e não totalmente coberta (o próprio dia do vencimento não é atraso) |
| A vencer | sem cobertura e vencimento hoje ou no futuro |

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
