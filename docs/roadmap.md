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

## Fase 3 — Painéis ✅ (14/10/2026)

Implementado e verificado:

- **Painel do administrador:** saldo em caixa em destaque; participantes ativos, cotas, arrecadação prevista e
  recebida, pendente em atraso, em análise; receitas, despesas, tributos e resultado parcial; **projeções** de
  remuneração administrativa e do valor destinado aos participantes (estilo "projeção não garantida"); medidor de
  adimplentes × inadimplentes com a lista de quem está em atraso.
- **Gráficos** (com visão em tabela): contribuições por mês (recebido × previsto), entradas × saídas do caixa,
  resultado parcial acumulado. **Filtros** de ciclo e período (atalhos: ciclo todo, últimos 6 e 3 meses).
- **Participante:** Minha Caixinha no formato do enunciado (cotas, mensalidade, total depositado, resultados
  atribuídos, saldo demonstrativo, próximo vencimento), **extrato** com saldo acumulado, **recibos em PDF** (valor
  por extenso e código de verificação), **comunicados**, **prestação de contas coletiva** (sem dados individuais).
- **Comunicados:** criação, rascunho/publicação, edição auditada, por grupo todo ou por ciclo.

Verificações: `typecheck` ✅ · `lint` ✅ · `test` ✅ (178 testes) · `build` ✅ · painel, gráficos, recibo PDF,
extrato, comunicados (incl. teste de XSS) e prestação de contas verificados no navegador ✅ · sem rolagem lateral em
375 px ✅.

## Fase 4 — Resultados ✅ (14/10/2026)

Implementado e verificado:

- **Motor de apuração** (política v1 aprovada pelo grupo): saldo diário proporcional com data de corte no fim das
  contribuições, antecipações contadas a partir do início, estornos/devoluções subtraindo dias, remuneração
  administrativa só sobre resultado positivo, prejuízo rateado pelo principal, trava de recursos, maior resto.
  Reproduz o exemplo do planejamento (Ana R$ 816,99 / Bruno R$ 443,01).
- **Fluxo:** encerrar contribuições → conciliar caixa → calcular (rascunho, com código de integridade) → aprovar
  (imutável) → registrar pagamentos → encerrar. Devolução de principal na saída. Correções pós-encerramento com
  justificativa. Remuneração administrativa bloqueada até validação jurídica (fica retida no caixa).
- **Telas:** apuração e distribuição (checklist das etapas), conciliação no livro-caixa, devolução de principal,
  relatórios; participante vê o resultado apurado e quando recebeu.
- **9 relatórios + extrato individual**, em PDF e Excel, com permissão por tipo e emissão auditada.

Verificações: `typecheck` ✅ · `lint` ✅ · testes ✅ (inclui fluxo completo de apuração, prejuízo, saída no meio
do ciclo, concorrência, relatórios e proteção contra fórmula no Excel) · `build` ✅ · encerramento completo de um
ciclo de demonstração no navegador ✅ · relatórios PDF/Excel baixados ✅.

## Fase 5 — Atividades de arrecadação ✅ (14/10/2026)

- Cadastro de atividades (evento, venda, doação, sorteio, outra) com datas, descrição, imagens, prêmios e
  participantes envolvidos; situação (rascunho → planejada → em andamento → concluída/cancelada).
- Controle financeiro por atividade: receitas e custos lançados no livro-caixa ligados à atividade; resultado por
  atividade; relatório "Atividades de arrecadação" (PDF/Excel).
- Sorteios **desativados por padrão**: simulação completa (numeração, reservas, confirmações, sorteio simulado) sem
  dinheiro; tela de Conformidade com pareceres e recursos sensíveis (justificativa + confirmação digitada); modo
  autorizado só com todas as condições; resultado oficial apenas registrado, nunca executado.
- Participante vê as atividades dos seus ciclos, os próprios números e os resultados.

Verificações: testes ✅ (inclui simulação sem dinheiro, bloqueios de conformidade, transação repetida, resultado
oficial único, imutabilidade no banco) · fluxo de simulação no navegador ✅ · participante vê só os próprios números ✅.

## Próximas fases

| Fase | Escopo |
| --- | --- |
| 6 — Integrações | Pix manual/simulado (QR, copia e cola), webhooks idempotentes, conciliação, notificações |
| 7 — Qualidade | 2FA para administradores, CSP com nonce, testes E2E (Playwright), revisão de segurança, documentação final |

## Decisões tomadas para a Fase 4 (14/10/2026)

Prejuízo proporcional ao contribuído · data de corte no fim das contribuições · antecipações contam a partir do
início · quem sai recebe o principal na saída e participa até ela. Ver [cálculos](calculos-financeiros.md).

Pendentes para a produção: hospedagem e provedor de e-mail; validação jurídica/tributária (remuneração
administrativa, estrutura da conta de recebimento).

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
- Painéis e gráficos apenas em tema claro (identidade visual do projeto).
- Recibos usam a fonte Helvetica embutida no PDF (acentos do português suportados; sem emojis).
- Relatórios em PDF usam a fonte Helvetica embutida: símbolos fora da codificação (ex.: Σ, sinal de menos tipográfico) são trocados por equivalentes.
- O extrato individual lista as contribuições; o pagamento de encerramento aparece no resumo do ciclo (não como linha do extrato).
- A página inicial do participante mostra o ciclo atual; resultados de ciclos encerrados aparecem no extrato.
