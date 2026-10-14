# Roadmap, funcionalidades e pendências

## Fase 1 — Fundação ✅ (14/10/2026)

Implementado e verificado:

- Projeto Next.js 16 + TypeScript strict, Tailwind 4, ESLint, Prettier.
- Modelo de dados completo de todas as fases (Prisma) + migrations.
- Gatilhos de integridade no PostgreSQL (append-only, partidas dobradas, ciclo travado, regras congeladas,
  apuração imutável, anti-duplicidade, CHECKs) — **testados**.
- Autenticação: login, saída, recuperação e redefinição de senha; argon2id; sessões no banco; cadastro público
  desativado; bloqueio de usuário suspenso; rate limiting.
- Permissões (RBAC) no servidor com isolamento entre participantes — **testadas**.
- Auditoria (login, saída, redefinição de senha, seed, criação de admin) + tela de consulta.
- Identidade visual: paleta, tipografia, logotipo, componentes (botão, campo, card, badge, alerta, valor
  financeiro com 3 estados visuais, card de indicador).
- Áreas do administrador e do participante (estrutura e navegação, desktop e celular).
- PWA: manifest, ícones (192/512/maskable/Apple), service worker conservador, página offline.
- Cabeçalhos de segurança (CSP etc.).
- Seed de demonstração (dados fictícios) e script de criação de administrador.
- Documentação inicial.

Verificações executadas: `typecheck` ✅ · `lint` ✅ · `test` ✅ (59 testes) · `build` ✅ · testes manuais de
login, isolamento de perfis, CSRF, rate limit e recuperação de senha ✅.

## Próximas fases

| Fase | Escopo |
| --- | --- |
| 2 — Gestão financeira | Participantes (convite, busca, filtros), ciclos e regras (congelamento + aceite), cotas, parcelas, pagamentos (parcial, antecipado, estorno, anti-duplicidade), livro-caixa |
| 3 — Painéis | Dashboard administrativo com indicadores e gráficos; Minha Caixinha completa; extrato; recibos PDF; comunicados |
| 4 — Resultados | Apuração, remuneração, distribuição (saldo diário), conciliação, encerramento, relatórios PDF/Excel |
| 5 — Arrecadação | Atividades, prêmios, imagens, custos, numeração em simulação, fluxo de conformidade |
| 6 — Integrações | Pix manual/simulado (QR, copia e cola), webhooks idempotentes, conciliação, notificações |
| 7 — Qualidade | 2FA admin, CSP com nonce, testes E2E (Playwright), revisão de segurança, documentação final |

## Decisões pendentes (necessárias antes das Fases 2 e 4)

1. Tratamento de resultado líquido negativo.
2. Data de corte do cálculo de saldo diário (fim das contribuições ou data da distribuição).
3. Antecipações antes do início do ciclo contam a partir do início? (recomendado: sim)
4. Data de referência: crédito na conta (recomendado) ou confirmação pelo admin.
5. Dia de vencimento mensal (padrão atual: 10).
6. Multa/juros por atraso (recomendado: não na v1).
7. Saída de participante no meio do ciclo.
8. Mudança de cotas no meio do ciclo.
9. Administrador também participante: exigir segundo administrador para confirmar os próprios pagamentos?
10. Hospedagem de produção e provedor de e-mail.

## Limitações conhecidas

- Banco local de desenvolvimento roda em PGlite (PostgreSQL 17 compilado para WebAssembly) via `prisma dev`;
  desempenho inferior a um PostgreSQL nativo — adequado apenas para desenvolvimento.
- CSP ainda permite `'unsafe-inline'` em scripts (exigência do Next.js sem nonce).
- Tentativas de login malsucedidas são bloqueadas pelo rate limit, mas ainda não registradas na auditoria.
- 2FA ainda não implementado.
- Sem testes E2E automatizados ainda (verificação manual nesta fase).
- Itens de menu das próximas fases aparecem como "em breve".
