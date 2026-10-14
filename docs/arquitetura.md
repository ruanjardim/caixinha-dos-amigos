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

Módulos atuais: `auth`, `audit`. Próximos: `participants`, `cycles`, `payments`, `ledger`, `results`,
`fundraising`, `reports`, `pix`, `notifications`.

## Decisões técnicas

| Decisão | Motivo |
| --- | --- |
| **Better Auth** em vez de Auth.js | Com e-mail/senha, o Auth.js força sessão JWT (não revogável). Better Auth mantém sessões no banco — suspender um usuário ou trocar a senha encerra as sessões imediatamente. |
| **argon2id** (`@node-rs/argon2`) | Recomendação OWASP atual para hash de senha. |
| **Prisma 7.10** (e não o 8.0-rc marcado como "latest" no npm) | Usar somente versões estáveis. |
| **`prisma dev`** para o banco local | Permite desenvolver sem instalar PostgreSQL/Docker. Produção usa PostgreSQL dedicado. |
| **Service worker próprio** em vez de Serwist | Serwist depende de webpack; o Next 16 usa Turbopack. O SW necessário é pequeno e deliberadamente conservador (não guarda páginas com saldos). |
| **Partidas dobradas simplificadas** no livro-caixa | Permite conciliar saldo contábil com o extrato e garantir, no banco, que todo lançamento fecha em zero. |
| **Gatilhos no PostgreSQL** | Integridade não depende apenas do código da aplicação. |
