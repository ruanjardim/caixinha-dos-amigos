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
