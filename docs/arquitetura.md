# Arquitetura

## Visão geral

```
Navegador (PWA)
   │  HTTPS, cookie de sessão httpOnly
   ▼
Next.js (App Router)
   ├─ proxy.ts ............ barreira otimista (sem cookie → /login)
   ├─ app/ ................ páginas (Server Components) e Route Handlers
   │     └─ chamam requirePagePermission / requirePermission
   ├─ modules/<domínio>/ .. actions → service → repository (Prisma)
   │     └─ toda mutação grava AuditLog na MESMA transação
   ├─ domain/ ............. cálculos puros (dinheiro, parcelas, distribuição)
   └─ lib/ ................ env, db, e-mail, senha
   ▼
PostgreSQL
   └─ gatilhos de integridade (append-only, partidas dobradas, ciclo travado)
```

## Princípios

1. **Defesa em profundidade.** Permissão é verificada no servidor em toda página e ação; o banco tem gatilhos
   que impedem violar regras financeiras mesmo se a aplicação tiver um bug.
2. **Previsto ≠ recebido.** `Installment` (parcela prevista) e `Payment` (dinheiro) são tabelas distintas.
3. **Nada financeiro é apagado.** Correções são lançamentos de reversão.
4. **Regras congeladas.** `CycleRules` vira imutável quando o ciclo abre (com hash do conteúdo).
5. **Centavos inteiros.** Nenhum cálculo usa ponto flutuante (`src/domain/money.ts`).
6. **Lógica de negócio pura e testável** em `src/domain/`.

## Módulos

Cada módulo em `src/modules/<nome>/` segue o padrão:

| Arquivo         | Papel                                                          |
| --------------- | -------------------------------------------------------------- |
| `schemas.ts`    | Schemas Zod de entrada (validados no servidor)                 |
| `actions.ts`    | Server Actions: autenticação → permissão → validação → service |
| `service.ts`    | Regras de negócio, transações, auditoria                       |
| `repository.ts` | Consultas Prisma (sempre parametrizadas)                       |
| `policy.ts`     | Regras de permissão específicas do módulo (quando houver)      |

Módulos atuais: `auth`, `audit`, `participants`, `cycles`, `payments`, `ledger`, `files`. Próximos: `results`,
`fundraising`, `reports`, `pix`, `notifications`.

Ordem obrigatória em toda Server Action: **sessão/permissão → validação (Zod) → serviço**. Serviços recebem o
"ator" já autorizado e gravam a auditoria na mesma transação da operação.

## Decisões técnicas

| Decisão | Motivo |
| --- | --- |
| **Better Auth** em vez de Auth.js | Com e-mail/senha, o Auth.js força sessão JWT (não revogável). Better Auth mantém sessões no banco — suspender um usuário ou trocar a senha encerra as sessões imediatamente. |
| **argon2id** (`@node-rs/argon2`) | Recomendação OWASP atual para hash de senha. |
| **Prisma 7.10** (e não o 8.0-rc marcado como "latest" no npm) | Usar somente versões estáveis. |
| **PostgreSQL 17 local via `embedded-postgres`** (`npm run db:start`) | Binários oficiais do PostgreSQL, sem instalação nem Docker. Substituiu o `prisma dev` (PGlite) usado na Fase 1, que compartilha UMA sessão entre todas as conexões — transações simultâneas se misturavam e a instância travava sob os testes. Inaceitável para um sistema financeiro. |
| **Cobertura de parcelas calculada** (sem tabela de alocação) | Quais parcelas um pagamento quita é derivado, de forma determinística, dos pagamentos confirmados (ordem cronológica). Estornos e alterações de cotas se refletem automaticamente, sem regravar alocações. Ver [cálculos](calculos-financeiros.md). |
| **Partidas dobradas verificadas por comando** | Todas as linhas de um lançamento são gravadas em um único INSERT e um gatilho confere a soma zero ao fim do comando. Mais previsível que uma restrição adiada. |
| **Trava por ciclo + troca atômica de status** | Lançamentos de um ciclo são serializados (`pg_advisory_xact_lock`) e a confirmação usa `UPDATE ... WHERE status IN (...)`: duas confirmações simultâneas → só uma vence (testado). |
| **Chave de idempotência por formulário** | Reenvio acidental do mesmo formulário não duplica pagamento. |
| **Service worker próprio** em vez de Serwist | Serwist depende de webpack; o Next 16 usa Turbopack. O SW necessário é pequeno e deliberadamente conservador (não guarda páginas com saldos). |
| **Partidas dobradas simplificadas** no livro-caixa | Permite conciliar saldo contábil com o extrato e garantir, no banco, que todo lançamento fecha em zero. |
| **Gatilhos no PostgreSQL** | Integridade não depende apenas do código da aplicação. |
