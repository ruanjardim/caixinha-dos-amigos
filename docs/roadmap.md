# Roadmap, funcionalidades e pendências

## Fase 1 — Fundação ✅ (14/10/2026)

- Projeto Next.js 16 + TypeScript strict, Tailwind 4, ESLint, Prettier.
- Modelo de dados de todas as fases (Prisma) + migrations e gatilhos de integridade.
- Autenticação (login, saída, recuperação de senha, argon2id, sessões no banco, cadastro público desativado,
  rate limiting), permissões no servidor, auditoria, identidade visual, PWA, cabeçalhos de segurança.

## Fase 2 — Gestão financeira ✅ (14/10/2026)

Implementado e verificado:

- **Participantes:** cadastro mínimo (LGPD), busca por nome/e-mail/telefone, filtro por situação, edição com
  auditoria (antes/depois), inativação (suspende o acesso), convite de acesso por e-mail (o participante define a
  própria senha), suspensão de acesso. Participante edita só o próprio telefone.
- **Ciclos e regras:** criação com datas, dia de vencimento, valores de cota e % administrativo; texto de regras
  padrão gerado automaticamente (sem promessa de rendimento); **publicação congela as regras** (hash SHA-256);
  aceite individual registrado; abertura gera as parcelas previstas; encerramento das contribuições após a data.
- **Cotas:** várias cotas por participante; mensalidade, previsto, recebido, em atraso, antecipado e saldo calculados;
  inclusão com o ciclo aberto; alteração de cotas com vigência futura; saída no meio do ciclo.
- **Pagamentos:** informados pelo participante (com comprovante opcional) ficam **em análise**; a administração
  confere, confirma, recusa, corrige (antes da confirmação) ou estorna (depois). Registro direto pela administração.
  Parciais, antecipados e atrasados tratados pela regra de cobertura. Anti-duplicidade em 3 níveis. Administrador
  não confirma o próprio pagamento havendo outro administrador.
- **Livro-caixa:** partidas dobradas; contribuição lançada automaticamente na confirmação; receitas adicionais,
  despesas e tributos manuais; estorno por lançamento inverso; despesa não pode exceder o caixa; saldos separando
  principal dos participantes, receitas, despesas, tributos e resultado parcial (marcado como não apurado).
- **Área do participante:** resumo (recebido × previsto × em análise), próximo vencimento, parcelas, pagamentos,
  informar pagamento, regras com aceite, meus dados.
- **Banco local real:** PostgreSQL 17 via `npm run db:start` (substitui o `prisma dev`).

Verificações: `typecheck` ✅ · `lint` ✅ · `test` ✅ (142 testes, 5 execuções seguidas estáveis) · `build` ✅ ·
fluxo completo no navegador (criar ciclo → incluir participante → publicar regras → abrir → aceite → informar
pagamento → conferir/confirmar → livro-caixa) ✅ · páginas sem rolagem lateral em 375 px ✅.

### Decisões adotadas por padrão (podem ser revistas)

| Tema | Padrão implementado |
| --- | --- |
| Data de referência do pagamento | Data de **crédito na conta** (informada e conferida na confirmação) |
| Dia de vencimento | Configurável por ciclo (padrão 10) |
| Multa/juros por atraso | Não há |
| Entrada no meio do ciclo | Deve a partir do mês de entrada |
| Alteração de cotas | Só para parcelas ainda não vencidas, com motivo |
| Saída no meio do ciclo | Parcelas seguintes deixam de ser devidas; devolução e resultados: **pendente (Fase 4)** |
| Administrador participante | Outro administrador confirma; se único, justificativa obrigatória |

## Próximas fases

| Fase | Escopo |
| --- | --- |
| 3 — Painéis | Dashboard com indicadores e gráficos (evolução mensal, entradas × saídas, adimplência, resultado acumulado), filtros por período/ciclo; extrato e recibos em PDF; comunicados |
| 4 — Resultados | Apuração, remuneração administrativa, distribuição (saldo diário), conciliação com extrato, encerramento e correções pós-encerramento, relatórios PDF/Excel |
| 5 — Arrecadação | Atividades, prêmios, imagens, custos, numeração em simulação, fluxo de conformidade |
| 6 — Integrações | Pix manual/simulado (QR, copia e cola), webhooks idempotentes, conciliação, notificações |
| 7 — Qualidade | 2FA para administradores, CSP com nonce, testes E2E (Playwright), revisão de segurança, documentação final |

## Decisões ainda pendentes (necessárias para a Fase 4)

1. Tratamento de resultado líquido negativo.
2. Data de corte do saldo diário (fim das contribuições ou data da distribuição).
3. Antecipações antes do início do ciclo contam dias a partir do início? (recomendado: sim)
4. Quem sai no meio do ciclo: quando recebe o principal e se participa do resultado.
5. Hospedagem de produção e provedor de e-mail.

## Limitações conhecidas

- E-mails em desenvolvimento são gravados em `.outbox/` (sem SMTP). O link de convite/senha vale 1 hora; a
  administração pode reenviá-lo.
- Comprovantes ficam no disco local (`storage/uploads`); em produção será preciso um volume persistente ou
  armazenamento de objetos, incluído no backup.
- Se o envio do formulário falhar depois de o comprovante ser gravado, o arquivo fica órfão no disco (sem
  vínculo e inacessível). Limpeza periódica prevista para a Fase 7.
- No celular, a barra inferior do administrador mostra 5 atalhos; a Auditoria fica acessível pelo painel.
- CSP ainda permite `'unsafe-inline'` em scripts; 2FA ainda não implementado; sem testes E2E automatizados (fluxo
  verificado manualmente no navegador).
- Itens de menu das próximas fases aparecem como "em breve".
