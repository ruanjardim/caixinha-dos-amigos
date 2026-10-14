/**
 * Resultados possíveis do processamento de um evento de webhook Pix.
 * Os que exigem ação humana ficam destacados na conciliação e geram aviso à administração.
 */
export const WEBHOOK_OUTCOMES = {
  PAGO: "Pago — pagamento em análise para conferência",
  PAGO_VALOR_DIVERGENTE: "Pago com valor diferente do cobrado",
  PAGO_APOS_EXPIRACAO: "Pago após expiração/cancelamento da cobrança",
  PAGAMENTO_DUPLICADO: "Pagamento em duplicidade — avaliar devolução",
  CICLO_SEM_RECEBIMENTO: "Pago, mas o ciclo não recebe mais pagamentos",
  COBRANCA_DESCONHECIDA: "Cobrança desconhecida",
  DEVOLVIDO: "Devolução registrada",
  DEVOLUCAO_PARCIAL: "Devolução parcial — conferir",
  DEVOLUCAO_PAGAMENTO_CONFIRMADO: "Devolução de pagamento já confirmado — estornar no sistema",
  DEVOLUCAO_SEM_PAGAMENTO: "Devolução sem pagamento correspondente",
  EXPIRADA: "Cobrança expirada",
  IGNORADO: "Evento sem efeito",
  ASSINATURA_INVALIDA: "Assinatura inválida — rejeitado",
  CONTEUDO_INVALIDO: "Conteúdo inválido — rejeitado",
  FALHA: "Falha no processamento (o provedor reenviará)",
} as const;

export type WebhookOutcome = keyof typeof WEBHOOK_OUTCOMES;

export const ATTENTION_OUTCOMES: ReadonlySet<string> = new Set<WebhookOutcome>([
  "PAGO_VALOR_DIVERGENTE",
  "PAGO_APOS_EXPIRACAO",
  "PAGAMENTO_DUPLICADO",
  "CICLO_SEM_RECEBIMENTO",
  "COBRANCA_DESCONHECIDA",
  "DEVOLUCAO_PARCIAL",
  "DEVOLUCAO_PAGAMENTO_CONFIRMADO",
  "DEVOLUCAO_SEM_PAGAMENTO",
  "ASSINATURA_INVALIDA",
  "FALHA",
]);

export function outcomeLabel(outcome: string | null): string {
  if (!outcome) return "Não processado";
  return (WEBHOOK_OUTCOMES as Record<string, string>)[outcome] ?? outcome;
}
