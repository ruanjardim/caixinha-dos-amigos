import { Badge } from "@/components/ui/badge";

type Tone = "green" | "blue" | "amber" | "red" | "gray";

const PAYMENT: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pendente", tone: "gray" },
  UNDER_REVIEW: { label: "Em análise", tone: "amber" },
  CONFIRMED: { label: "Confirmado", tone: "green" },
  CANCELLED: { label: "Cancelado", tone: "gray" },
  REVERSED: { label: "Estornado", tone: "red" },
};

const CYCLE: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Em preparação", tone: "gray" },
  OPEN: { label: "Aberto", tone: "green" },
  CONTRIBUTIONS_CLOSED: { label: "Contribuições encerradas", tone: "blue" },
  SETTLING: { label: "Em apuração", tone: "blue" },
  CLOSED: { label: "Encerrado", tone: "gray" },
};

const PARTICIPANT: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Ativo", tone: "green" },
  INACTIVE: { label: "Inativo", tone: "gray" },
  LEFT: { label: "Saiu", tone: "gray" },
};

const INSTALLMENT: Record<string, { label: string; tone: Tone }> = {
  PAID: { label: "Paga", tone: "green" },
  ADVANCED: { label: "Antecipada", tone: "blue" },
  PARTIAL: { label: "Parcial", tone: "amber" },
  OVERDUE: { label: "Em atraso", tone: "red" },
  OPEN: { label: "A vencer", tone: "gray" },
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PIX_MANUAL: "Pix",
  PIX_SIMULATED: "Pix (simulação)",
  PIX_PROVIDER: "Pix (prestador)",
  BANK_TRANSFER: "Transferência",
  CASH: "Dinheiro",
  OTHER: "Outro",
};

export const MANUAL_PAYMENT_METHODS = ["PIX_MANUAL", "BANK_TRANSFER", "CASH", "OTHER"] as const;

function make(map: Record<string, { label: string; tone: Tone }>) {
  return function StatusBadge({ status }: { status: string }) {
    const s = map[status] ?? { label: status, tone: "gray" as Tone };
    return <Badge tone={s.tone}>{s.label}</Badge>;
  };
}

export const PaymentStatusBadge = make(PAYMENT);
export const CycleStatusBadge = make(CYCLE);
export const ParticipantStatusBadge = make(PARTICIPANT);
export const InstallmentStatusBadge = make(INSTALLMENT);

export function paymentStatusLabel(status: string) {
  return PAYMENT[status]?.label ?? status;
}
export function cycleStatusLabel(status: string) {
  return CYCLE[status]?.label ?? status;
}

const ACTIVITY_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Rascunho", tone: "gray" },
  PLANNED: { label: "Planejada", tone: "blue" },
  IN_PROGRESS: { label: "Em andamento", tone: "green" },
  FINISHED: { label: "Concluída", tone: "gray" },
  CANCELLED: { label: "Cancelada", tone: "red" },
};

const COMPLIANCE: Record<string, { label: string; tone: Tone }> = {
  NOT_REQUIRED: { label: "Não exige parecer", tone: "gray" },
  PENDING_REVIEW: { label: "Aguardando parecer", tone: "amber" },
  APPROVED: { label: "Parecer favorável", tone: "green" },
  REJECTED: { label: "Parecer contrário", tone: "red" },
};

export const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  EVENT: "Evento",
  PRODUCT_SALE: "Venda de produtos",
  DONATION: "Doação",
  RAFFLE: "Sorteio",
  OTHER: "Outra",
};

export const ActivityStatusBadge = make(ACTIVITY_STATUS);
export const ComplianceBadge = make(COMPLIANCE);

const PIX_CHARGE: Record<string, { label: string; tone: Tone }> = {
  CREATED: { label: "Criada", tone: "gray" },
  ACTIVE: { label: "Aguardando pagamento", tone: "blue" },
  PAID: { label: "Paga", tone: "green" },
  EXPIRED: { label: "Expirada", tone: "gray" },
  CANCELLED: { label: "Cancelada", tone: "gray" },
  REFUNDED: { label: "Devolvida", tone: "red" },
  FAILED: { label: "Falhou", tone: "red" },
};

export const PixChargeStatusBadge = make(PIX_CHARGE);
