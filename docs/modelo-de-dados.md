# Modelo de dados

Fonte da verdade: [`prisma/schema.prisma`](../prisma/schema.prisma). Valores monetários são `Int` em **centavos**.

## Grupos de tabelas

### Identidade e acesso
| Tabela | Descrição |
| --- | --- |
| `user` | Usuário do sistema: nome, e-mail, `role` (ADMIN/PARTICIPANT), `status` (ACTIVE/SUSPENDED) |
| `session` | Sessões ativas (revogáveis) |
| `account` | Credencial (hash argon2id da senha) |
| `verification` | Tokens de redefinição de senha |
| `rate_limit` | Contadores de limite de tentativas |
| `audit_log` | Trilha de auditoria — **somente inclusão** |

### Ciclos e participação
| Tabela | Descrição |
| --- | --- |
| `cycle` | Ciclo anual: datas, dia de vencimento, status (DRAFT → OPEN → CONTRIBUTIONS_CLOSED → SETTLING → CLOSED) |
| `cycle_rules` | Versão das regras: % administrativo (em pontos-base), método de distribuição, valores de cota, texto integral, hash. **Imutável após congelar.** |
| `rules_acceptance` | Aceite de cada participante a uma versão de regras |
| `participant` | Cadastro mínimo (LGPD): nome, e-mail, telefone, data de entrada, status |
| `membership` | Participante × ciclo: quantidade e valor da cota |
| `membership_change` | Histórico de mudança de cotas |
| `installment` | **Parcela prevista** (obrigação). Não é dinheiro. Cancelada (nunca apagada) quando deixa de ser devida. |

### Financeiro

> A tabela `payment_allocation` da Fase 1 foi removida: a cobertura das parcelas é **calculada** (ver
> [cálculos](calculos-financeiros.md)).

| Tabela | Descrição |
| --- | --- |
| `payment` | Pagamento: valor, data de crédito, meio, referência, status, quem registrou, quem confirmou (e justificativa), recusa, estorno, comprovante, chave de idempotência. Nunca apagado. Único por (meio, referência). |
| `ledger_transaction` / `ledger_line` | Livro-caixa em partidas dobradas. Soma das linhas = 0 (garantido no banco). Somente inclusão. |
| `cash_reconciliation` | Conciliação saldo contábil × extrato |

### Resultados
| Tabela | Descrição |
| --- | --- |
| `result_calculation` | Apuração: receitas, despesas, tributos, resultado líquido, remuneração adm., distribuível, snapshot e hash. Imutável após aprovação. |
| `result_share` | Peso (centavos × dias) e parcela de cada participante |
| `distribution` | Pagamento de principal + resultado ao participante |

### Arrecadação, Pix e diversos
`fundraising_activity`, `prize`, `activity_image`, `activity_participant`, `raffle_number` (somente simulação),
`compliance_approval`, `pix_charge`, `webhook_event` (idempotência), `announcement`, `file_upload`,
`feature_flag` (todas começam desligadas).

## Contas do livro-caixa

| Conta | Natureza |
| --- | --- |
| `CASH` | Dinheiro disponível na conta da caixinha |
| `PARTICIPANT_PRINCIPAL` | Principal devido aos participantes |
| `ADDITIONAL_REVENUE` | Receitas adicionais |
| `EXPENSE` | Despesas |
| `TAX` | Tributos e deduções |
| `ADMIN_FEE` | Remuneração administrativa |
| `RESULT_TO_DISTRIBUTE` | Resultado destinado aos participantes |

Exemplo — contribuição de R$ 100 confirmada:

| Conta | Valor (centavos) |
| --- | --- |
| CASH | +10000 |
| PARTICIPANT_PRINCIPAL | −10000 |

## Proteções no banco (migration `integrity_triggers`)

- `audit_log`, `ledger_transaction`, `ledger_line`: UPDATE/DELETE bloqueados.
- `payment`, `installment`: DELETE bloqueado.
- Ciclo de vida do pagamento: PENDENTE → EM ANÁLISE → CONFIRMADO → ESTORNADO (ou → RECUSADO). Cancelado e estornado são finais; confirmado exige data de crédito e responsável; depois de confirmado, valor, data, participante, meio e referência são imutáveis.
- Lançamento com soma ≠ 0 é rejeitado ao fim do INSERT das linhas (gatilho por comando).
- Ciclo `CLOSED` só aceita lançamentos com `postClosing = true` (procedimento auditável); ciclo `DRAFT` não aceita lançamentos.
- `cycle_rules` congeladas não podem ser alteradas.
- Apuração `APPROVED` não pode ser alterada (só marcada como `SUPERSEDED`).
- `result_share`, `distribution`, `cash_reconciliation`: somente inclusão. Uma distribuição por participação (único); uma apuração aprovada por ciclo (índice único parcial).
- CHECKs: valores positivos, dia de vencimento 1–28, datas do ciclo em ordem, % administrativo entre 0 e 100%.
