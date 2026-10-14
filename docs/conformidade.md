# Conformidade jurídica

> Este documento descreve **salvaguardas técnicas**. Ele não substitui a análise de advogado e contador.

## Recursos desligados por padrão

| Chave (`feature_flag`) | Recurso                                                                | Depende de                                                                                              |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `RAFFLE_SALES_ENABLED` | Venda de números / cobrança vinculada a sorteios / execução de sorteio | Modalidade legalmente autorizada + aprovação de conformidade registrada                                 |
| `PIX_LIVE_ENABLED`     | Cobrança Pix real por prestador de pagamentos                          | Estrutura jurídica (ex.: associação com CNPJ) e conta de recebimento adequada — **nunca conta pessoal** |
| `ADMIN_PAYOUT_ENABLED` | Pagamento da remuneração administrativa                                | Validação jurídica e tributária                                                                         |

As chaves são criadas desligadas pela migration e só mudam na tela **Conformidade** (perfil administrador):
ligar exige justificativa (≥ 30 caracteres, com base legal/parecer) e digitar `ATIVAR`; desligar exige motivo. Toda
mudança fica na auditoria.

## Atividades de arrecadação e sorteios (Fase 5)

| Situação                 | O que o sistema permite                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sorteio recém-cadastrado | Somente **simulação**: cadastro, prêmios, imagens, numeração, reservas e "confirmações" sem dinheiro, sorteio simulado (não gravado, não oficial)                            |
| Parecer de conformidade  | Registro permanente (modalidade legal, autorização, parecer, documento, decisão); alterar regulamento, preço ou faixa depois de aprovado exige novo parecer                  |
| Modo autorizado          | Só com: parecer favorável **+** recurso "Venda de números" ligado **+** regulamento escrito **+** numeração ainda não gerada em simulação. A simulação nunca vira venda real |
| Venda autorizada         | Cada número pago exige identificação da transação (sem repetição) e gera receita no livro-caixa ligada à atividade                                                           |
| Resultado                | O sistema **não executa sorteio real**: registra uma única vez o resultado obtido pelo meio autorizado (ex.: Loteria Federal), com a fonte                                   |
| Parecer contrário        | Bloqueia qualquer movimentação de dinheiro da atividade                                                                                                                      |

Atividades comuns (evento, venda de produtos, doação) não exigem parecer e registram receitas e custos no
livro-caixa, ligados à atividade (resultado por atividade visível a todos os participantes).

## Pontos de atenção identificados

- **Captação de recursos com distribuição de resultados:** pode se aproximar de atividade privativa de instituição
  financeira (Lei 7.492/1986) ou de oferta de contrato de investimento coletivo (Lei 6.385/1976, competência da
  CVM). O caráter privado do grupo reduz, mas não elimina, o risco. Salvaguardas: nenhuma promessa de rendimento,
  linguagem de "resultado apurado", regras aceitas formalmente, sem investimentos externos.
- **Rifas e sorteios pagos:** em regra dependem de autorização (Lei 5.768/1971); sem ela podem configurar
  contravenção penal (Decreto-Lei 3.688/1941, art. 51). Ser um grupo privado **não** é autorização.
- **Tributação:** remuneração administrativa e eventuais resultados distribuídos podem ter incidência tributária.
- **LGPD:** ver [seguranca.md](seguranca.md).

## O que o sistema NÃO faz

- Não investe recursos.
- Não promete rentabilidade.
- Não confirma pagamentos automaticamente por envio de comprovante.
- Não executa cobranças reais em modo de simulação.
- Não oferece mecanismos para contornar exigências legais.
