# Integrações: Pix, conciliação e notificações

## Pix

### Modos

| `PIX_PROVIDER`       | O que faz                                                                                                                                                                                                                                                         | Confirmação                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `simulated` (padrão) | Gera cobranças **fictícias** com QR Code e copia e cola. A chave usada (`SIMULACAO-SEM-VALOR-REAL`) não segue nenhum formato do DICT: nenhum banco aceita pagar o código. O "Ambiente de simulação" dispara eventos assinados pelo mesmo caminho do webhook real. | Pagamento entra **em análise**; a administração confere e confirma. |
| `manual`             | Gera o código Pix para a **conta da caixinha** (`PIX_MANUAL_KEY`, `PIX_MANUAL_RECEIVER_NAME`, `PIX_MANUAL_CITY`). O participante paga e informa o pagamento.                                                                                                      | Sempre humana, pelo extrato bancário. Não há webhook.               |

Regras do modo manual:

- A chave precisa ser válida (CNPJ, e-mail, telefone `+55…` ou chave aleatória).
- **Chave do tipo CPF é recusada**: identifica conta de pessoa física, e os recursos coletivos não podem ter uma
  conta pessoal como destino padrão. E-mail, telefone e chave aleatória não revelam o titular — conferir que
  pertencem à conta da estrutura jurídica é responsabilidade da administração (registrar na Conformidade).
- O nome do recebedor aparece para o participante, que deve conferi-lo no app do banco antes de pagar.

Um prestador de serviços de pagamento (PSP) real deve implementar o mesmo contrato (`PixProvider` em
`src/modules/pix/providers.ts`): cobrança dinâmica, webhook com assinatura própria e credenciais guardadas fora do
código (cofre de segredos), ativado somente com a flag `PIX_LIVE_ENABLED`, conta da estrutura jurídica e parecer
jurídico. **Nada disso está ativo.**

### Cobrança

`txid` com 25 caracteres alfanuméricos imprevisíveis; valor, descrição (até 40 caracteres, sem acentos) e validade
(1 a 30 dias). O BR Code segue o padrão EMV do Banco Central (TLV + CRC16-CCITT) — testado contra o exemplo
oficial do manual. QR Code gerado no servidor, sem serviço externo.

O participante vê na tela **Pagar** apenas as próprias cobranças em aberto (testado).

### Webhook

`POST /api/webhooks/pix/<provedor>` — só o provedor configurado em `PIX_PROVIDER` responde; os demais devolvem 404.

| Proteção           | Como                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticidade      | `x-caixinha-signature: v1=<HMAC-SHA256(PIX_WEBHOOK_SECRET, "<timestamp>.<corpo>")>`, comparação em tempo constante                                                               |
| Reaproveitamento   | `x-caixinha-timestamp` (segundos) com janela de 5 minutos                                                                                                                        |
| Idempotência       | `id` do evento único por provedor (índice único no banco) — o mesmo evento nunca é processado duas vezes                                                                         |
| Tamanho            | Corpo limitado a 64 KB                                                                                                                                                           |
| Registro de falhas | Todo evento fica em `webhook_event` — inclusive assinatura inválida e conteúdo malformado (amostra de até 2.000 caracteres). Conteúdo imutável e sem exclusão (gatilho no banco) |
| Erro inesperado    | Responde 500 (o provedor reenvia); a falha é registrada sem ocupar o id do evento                                                                                                |

Eventos aceitos (valores sempre em centavos):

```json
{ "id": "evt-1", "type": "pix.paid", "txid": "CX…", "amountCents": 10000, "endToEndId": "E…", "paidAt": "2026-12-05T15:00:00Z" }
{ "id": "evt-2", "type": "pix.refunded", "txid": "CX…", "amountCents": 10000, "refundId": "D…", "refundedAt": "…" }
{ "id": "evt-3", "type": "pix.expired", "txid": "CX…" }
```

### Conciliação (o que acontece em cada caso)

| Situação                                | Resultado                                                                   | Ação humana                                                   |
| --------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Pago no valor cobrado                   | Cobrança **paga**; pagamento **em análise** vinculado (E2E como referência) | Conferir e confirmar — só então entra no livro-caixa          |
| Mesmo evento reenviado                  | Ignorado (HTTP 200)                                                         | —                                                             |
| Segundo Pix para a mesma cobrança       | "Pagamento em duplicidade"; nenhum pagamento novo                           | Avaliar devolução                                             |
| Valor diferente                         | Pagamento em análise com o valor **realmente recebido** e observação        | Conferir                                                      |
| Pago após expirar/cancelar              | Pagamento em análise, sinalizado                                            | Conferir                                                      |
| Ciclo que não recebe mais pagamentos    | Cobrança paga, sem pagamento                                                | Decidir (devolução/ajuste)                                    |
| `txid` desconhecido                     | Registrado                                                                  | Investigar                                                    |
| Devolução antes da conferência          | Cobrança devolvida; pagamento em análise **cancelado**                      | —                                                             |
| Devolução de pagamento já confirmado    | Cobrança devolvida; livro-caixa **não é alterado**                          | Estornar o pagamento no sistema (lançamento inverso auditado) |
| Devolução parcial                       | Registrada                                                                  | Conferir                                                      |
| Assinatura inválida / conteúdo inválido | Rejeitado (401/400) e registrado                                            | Verificar origem                                              |

Nenhum evento confirma pagamento sozinho nem altera o livro-caixa. A tela **Pix e conciliação** mostra cobranças,
eventos e destaca os que pedem atenção; a administração recebe aviso por e-mail.

## Notificações por e-mail

| Evento                                      | Quem recebe                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Pagamento informado                         | Administradores ativos                                                                                                     |
| Pagamento confirmado / recusado / estornado | Somente o próprio participante                                                                                             |
| Comunicado publicado                        | Participantes do ciclo do comunicado (ou todos, se for geral)                                                              |
| Apuração aprovada                           | Participantes do ciclo (sem valores no e-mail; o valor fica no app)                                                        |
| Pix recebido ou com pendência               | Administradores (assinatura inválida e falhas: no máximo um aviso por dia)                                                 |
| Lembrete de vencimento                      | Participante: 3 dias antes (inclusive no dia) e um aviso de atraso (até 30 dias). Pagamento em análise suspende o lembrete |

- **Envio único:** cada aviso tem uma chave (`dedupeKey`) única no banco — repetir a tarefa ou a ação não reenvia.
- **Preferência:** em "Meus dados", cada usuário pode desativar os avisos (registrados como "não enviado"). E-mails de
  segurança (redefinição de senha) sempre são enviados.
- **Falhas:** registradas com o motivo; nunca desfazem a operação que gerou o aviso (envio depois da resposta).
- **Registro:** os últimos envios aparecem em **Comunicados → Avisos por e-mail enviados**.
- Somente usuários com acesso ativo recebem avisos.

## Tarefa diária

`GET` ou `POST /api/tarefas/diarias` com `Authorization: Bearer <CRON_SECRET>` (comparação em tempo constante):

1. marca como expiradas as cobranças Pix vencidas;
2. envia os lembretes de vencimento.

Pode rodar mais de uma vez por dia sem reenviar avisos. Agende 1×/dia (ex.: 9h) no agendador da hospedagem; cada
execução fica na auditoria (`job.daily`).
