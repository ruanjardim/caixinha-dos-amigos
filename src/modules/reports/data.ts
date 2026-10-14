import "server-only";
import { PAYMENT_METHOD_LABEL } from "@/components/finance/status-badges";
import { CATEGORY_LABEL } from "@/components/finance/ledger-labels";
import { formatCompetence, formatDateBR, toISODate, todayInBrazil, type ISODate } from "@/domain/dates";
import { applyBps } from "@/domain/money";
import { formatPercentBps } from "@/domain/rules";
import { buildStatement } from "@/domain/statement";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getCycleDetail } from "@/modules/cycles/queries";
import { getCollectiveReport } from "@/modules/dashboard/queries";
import { getLedgerOverview } from "@/modules/ledger/service";
import { REPORT_TITLES, type ReportDoc, type ReportSection, type ReportType } from "./types";

const DISCLAIMER =
  "A caixinha não realiza investimentos e não promete rendimento. Resultados só existem após apuração aprovada, conforme as regras do ciclo.";

function slug(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

async function loadCycle(cycleId: string) {
  const cycle = await db.cycle.findUnique({
    where: { id: cycleId },
    include: { rules: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!cycle) throw new Error("Ciclo não encontrado.");
  return { cycle, rules: cycle.rules[0] ?? null };
}

function header(
  type: ReportType,
  cycleName: string,
  extra?: string,
): Pick<ReportDoc, "fileName" | "title" | "subtitle" | "generatedAt"> {
  return {
    fileName: `${slug(REPORT_TITLES[type])}-${slug(cycleName)}${extra ? `-${slug(extra)}` : ""}`,
    title: REPORT_TITLES[type],
    subtitle: `${cycleName}${extra ? ` · ${extra}` : ""}`,
    generatedAt: formatDateTime(new Date()),
  };
}

async function latestCalculation(cycleId: string) {
  return db.resultCalculation.findFirst({
    where: { cycleId, status: { in: ["APPROVED", "DRAFT"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // APPROVED antes de DRAFT
    include: {
      shares: {
        orderBy: { membership: { participant: { fullName: "asc" } } },
        include: {
          membership: { select: { participant: { select: { fullName: true } }, status: true } },
          distribution: true,
        },
      },
    },
  });
}

async function ledgerEntries(cycleId: string, excludeContributions = false) {
  return db.ledgerTransaction.findMany({
    where: {
      cycleId,
      ...(excludeContributions ? { category: { notIn: ["CONTRIBUTION", "CONTRIBUTION_REVERSAL"] } } : {}),
    },
    orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }],
    include: {
      lines: true,
      createdBy: { select: { name: true } },
    },
  });
}

const cash = (lines: { account: string; amountCents: number }[]) =>
  lines.filter((l) => l.account === "CASH").reduce((s, l) => s + l.amountCents, 0);

// ---------------------------------------------------------------------------

export async function buildReport(
  type: ReportType,
  cycleId: string,
  options: { membershipId?: string } = {},
): Promise<ReportDoc> {
  const today = todayInBrazil();
  switch (type) {
    case "contribuicoes":
      return contributionsReport(cycleId, today);
    case "pendencias":
      return pendingReport(cycleId, today);
    case "movimentacoes":
      return movementsReport(cycleId);
    case "receitas-despesas":
      return revenueExpenseReport(cycleId);
    case "resultado":
      return resultReport(cycleId);
    case "remuneracao":
      return adminFeeReport(cycleId);
    case "distribuicao":
      return distributionReport(cycleId);
    case "encerramento":
      return closingReport(cycleId, today);
    case "prestacao-de-contas":
      return collectiveReport(cycleId, today);
    case "extrato":
      if (!options.membershipId) throw new Error("Participação não informada.");
      return statementReport(options.membershipId);
  }
}

async function contributionsReport(cycleId: string, today: ISODate): Promise<ReportDoc> {
  const d = await getCycleDetail(cycleId, today);
  if (!d) throw new Error("Ciclo não encontrado.");
  const rows = d.memberships.map((m) => ({
    participante: m.participant.fullName,
    cotas: `${m.quotaCount} × ${(m.quotaValueCents / 100).toFixed(2).replace(".", ",")}`,
    mensalidade: m.quotaCount * m.quotaValueCents,
    previsto: m.summary.expectedTotalCents,
    recebido: m.summary.receivedCents,
    atraso: m.summary.overdueCents,
    antecipado: m.summary.advancedCents,
    situacao: m.status === "LEFT" ? "Saiu" : m.summary.overdueCount > 0 ? "Em atraso" : "Em dia",
  }));
  const sum = (k: "mensalidade" | "previsto" | "recebido" | "atraso" | "antecipado") =>
    rows.reduce((s, r) => s + r[k], 0);
  return {
    ...header("contribuicoes", d.cycle.name),
    summary: [
      { label: "Participantes ativos", value: d.totals.activeMembers, kind: "int" },
      { label: "Cotas", value: d.totals.quotas, kind: "int" },
      { label: "Previsto no ciclo", value: d.totals.expectedCents, kind: "money" },
      { label: "Recebido (confirmado)", value: d.totals.receivedCents, kind: "money" },
      { label: "Em atraso", value: d.totals.overdueCents, kind: "money" },
    ],
    sections: [
      {
        title: "Por participante",
        columns: [
          { key: "participante", label: "Participante", kind: "text", width: 3 },
          { key: "cotas", label: "Cotas (R$)", kind: "text" },
          { key: "mensalidade", label: "Mensalidade", kind: "money" },
          { key: "previsto", label: "Previsto", kind: "money" },
          { key: "recebido", label: "Recebido", kind: "money" },
          { key: "atraso", label: "Em atraso", kind: "money" },
          { key: "antecipado", label: "Antecipado", kind: "money" },
          { key: "situacao", label: "Situação", kind: "text" },
        ],
        rows,
        totals: {
          participante: "Total",
          mensalidade: sum("mensalidade"),
          previsto: sum("previsto"),
          recebido: sum("recebido"),
          atraso: sum("atraso"),
          antecipado: sum("antecipado"),
        },
      },
    ],
    notes: ["Previsto é obrigação, não dinheiro. Recebido considera somente pagamentos confirmados.", DISCLAIMER],
  };
}

async function pendingReport(cycleId: string, today: ISODate): Promise<ReportDoc> {
  const d = await getCycleDetail(cycleId, today);
  if (!d) throw new Error("Ciclo não encontrado.");
  const overdueRows = d.memberships.flatMap((m) =>
    m.summary.installments
      .filter((i) => i.overdue)
      .map((i) => ({
        participante: m.participant.fullName,
        competencia: formatCompetence(i.competence),
        vencimento: i.dueDate,
        previsto: i.expectedCents,
        aberto: i.remainingCents,
      })),
  );
  const review = await db.payment.findMany({
    where: { membership: { cycleId }, status: { in: ["PENDING", "UNDER_REVIEW"] } },
    orderBy: { createdAt: "asc" },
    include: { membership: { select: { participant: { select: { fullName: true } } } } },
  });
  return {
    ...header("pendencias", d.cycle.name, `posição em ${formatDateBR(today)}`),
    summary: [
      { label: "Valor em atraso", value: d.totals.overdueCents, kind: "money" },
      { label: "Participantes em atraso", value: d.totals.membersOverdue, kind: "int" },
      { label: "Em análise", value: d.totals.underReviewCents, kind: "money" },
    ],
    sections: [
      {
        title: "Parcelas vencidas em aberto",
        columns: [
          { key: "participante", label: "Participante", kind: "text", width: 3 },
          { key: "competencia", label: "Competência", kind: "text" },
          { key: "vencimento", label: "Vencimento", kind: "date" },
          { key: "previsto", label: "Previsto", kind: "money" },
          { key: "aberto", label: "Em aberto", kind: "money" },
        ],
        rows: overdueRows,
        totals: { participante: "Total", aberto: overdueRows.reduce((s, r) => s + r.aberto, 0) },
        emptyMessage: "Nenhuma parcela vencida em aberto.",
      },
      {
        title: "Pagamentos aguardando conferência",
        columns: [
          { key: "participante", label: "Participante", kind: "text", width: 3 },
          { key: "data", label: "Data informada", kind: "date" },
          { key: "forma", label: "Forma", kind: "text" },
          { key: "valor", label: "Valor", kind: "money" },
        ],
        rows: review.map((p) => ({
          participante: p.membership.participant.fullName,
          data: p.receivedAt ? toISODate(p.receivedAt) : null,
          forma: PAYMENT_METHOD_LABEL[p.method] ?? p.method,
          valor: p.amountCents,
        })),
        emptyMessage: "Nenhum pagamento em análise.",
      },
    ],
    notes: ["Em análise NÃO é dinheiro recebido: depende de conferência no extrato.", DISCLAIMER],
  };
}

async function movementsReport(cycleId: string): Promise<ReportDoc> {
  const { cycle } = await loadCycle(cycleId);
  const [entries, overview, memberships] = await Promise.all([
    ledgerEntries(cycleId),
    getLedgerOverview(cycleId),
    db.membership.findMany({ where: { cycleId }, select: { id: true, participant: { select: { fullName: true } } } }),
  ]);
  const names = new Map(memberships.map((m) => [m.id, m.participant.fullName]));
  const rows = entries.map((e) => {
    const effect = cash(e.lines);
    const memberLine = e.lines.find((l) => l.membershipId);
    return {
      data: toISODate(e.occurredOn),
      categoria: CATEGORY_LABEL[e.category] ?? e.category,
      descricao: e.description + (e.postClosing ? " [pós-encerramento]" : ""),
      participante: memberLine ? (names.get(memberLine.membershipId!) ?? "") : "",
      entrada: effect > 0 ? effect : null,
      saida: effect < 0 ? -effect : null,
      responsavel: e.createdBy.name,
    };
  });
  return {
    ...header("movimentacoes", cycle.name),
    summary: [
      { label: "Lançamentos", value: entries.length, kind: "int" },
      { label: "Saldo em caixa", value: overview.cashCents, kind: "money" },
      { label: "Principal dos participantes", value: overview.principalOwedCents, kind: "money" },
    ],
    sections: [
      {
        title: "Livro-caixa",
        columns: [
          { key: "data", label: "Data", kind: "date" },
          { key: "categoria", label: "Categoria", kind: "text", width: 2 },
          { key: "descricao", label: "Descrição", kind: "text", width: 4 },
          { key: "participante", label: "Participante", kind: "text", width: 2.5 },
          { key: "entrada", label: "Entrada", kind: "money" },
          { key: "saida", label: "Saída", kind: "money" },
          { key: "responsavel", label: "Responsável", kind: "text", width: 2 },
        ],
        rows,
        totals: {
          data: "Total",
          entrada: rows.reduce((s, r) => s + (r.entrada ?? 0), 0),
          saida: rows.reduce((s, r) => s + (r.saida ?? 0), 0),
        },
      },
    ],
    notes: [
      "Lançamentos nunca são apagados: correções aparecem como estornos ou correções pós-encerramento.",
      DISCLAIMER,
    ],
  };
}

async function revenueExpenseReport(cycleId: string): Promise<ReportDoc> {
  const { cycle } = await loadCycle(cycleId);
  const [entries, overview] = await Promise.all([ledgerEntries(cycleId, true), getLedgerOverview(cycleId)]);
  const relevant = entries.filter((e) => !["DISTRIBUTION", "PRINCIPAL_RETURN", "ADMIN_FEE"].includes(e.category));
  return {
    ...header("receitas-despesas", cycle.name),
    summary: [
      { label: "Receitas adicionais", value: overview.revenueCents, kind: "money" },
      { label: "Despesas", value: overview.expenseCents, kind: "money" },
      { label: "Tributos e deduções", value: overview.taxCents, kind: "money" },
      { label: "Resultado (receitas − despesas − tributos)", value: overview.partialResultCents, kind: "money" },
    ],
    sections: [
      {
        title: "Lançamentos",
        columns: [
          { key: "data", label: "Data", kind: "date" },
          { key: "categoria", label: "Categoria", kind: "text", width: 2 },
          { key: "descricao", label: "Descrição", kind: "text", width: 5 },
          { key: "valor", label: "Efeito no caixa", kind: "money" },
        ],
        rows: relevant.map((e) => ({
          data: toISODate(e.occurredOn),
          categoria: CATEGORY_LABEL[e.category] ?? e.category,
          descricao: e.description,
          valor: cash(e.lines),
        })),
        emptyMessage: "Nenhuma receita, despesa ou tributo lançado.",
      },
    ],
    notes: ["Contribuições dos participantes (principal) não são receita e não aparecem aqui.", DISCLAIMER],
  };
}

async function resultReport(cycleId: string): Promise<ReportDoc> {
  const { cycle } = await loadCycle(cycleId);
  const [calc, overview] = await Promise.all([latestCalculation(cycleId), getLedgerOverview(cycleId)]);
  const approved = calc?.status === "APPROVED";
  const approverName = calc?.approvedById
    ? (await db.user.findUnique({ where: { id: calc.approvedById }, select: { name: true } }))?.name
    : null;
  const revenue = approved ? calc.revenueCents : overview.revenueCents;
  const expense = approved ? calc.expenseCents : overview.expenseCents;
  const tax = approved ? calc.taxCents : overview.taxCents;
  return {
    ...header("resultado", cycle.name),
    stamp: approved ? undefined : "PARCIAL — ainda não apurado (projeção não garantida)",
    summary: [
      { label: "Receitas adicionais", value: revenue, kind: "money" },
      { label: "(−) Despesas", value: expense, kind: "money" },
      { label: "(−) Tributos e deduções", value: tax, kind: "money" },
      {
        label: approved ? "Resultado líquido apurado" : "Resultado líquido parcial",
        value: revenue - expense - tax,
        kind: "money",
      },
    ],
    sections: [],
    notes: [
      approved
        ? `Apuração aprovada em ${formatDateTime(calc.approvedAt!)} por ${approverName ?? "—"}. Código de integridade: ${calc.contentHash}.`
        : "Valores parciais: podem mudar até a apuração aprovada.",
      "Resultado líquido = receitas adicionais − despesas − tributos. Contribuições não entram no resultado.",
      DISCLAIMER,
    ],
  };
}

async function adminFeeReport(cycleId: string): Promise<ReportDoc> {
  const { cycle, rules } = await loadCycle(cycleId);
  const [calc, overview, flag] = await Promise.all([
    latestCalculation(cycleId),
    getLedgerOverview(cycleId),
    db.featureFlag.findUnique({ where: { key: "ADMIN_PAYOUT_ENABLED" } }),
  ]);
  const approved = calc?.status === "APPROVED";
  const net = approved ? calc.netResultCents : overview.partialResultCents;
  const fee = approved ? calc.adminFeeCents : rules ? applyBps(Math.max(0, net), rules.adminFeeBps) : 0;
  const status =
    overview.adminFeePaidCents > 0
      ? "Paga"
      : approved
        ? flag?.enabled
          ? "Apurada, a pagar"
          : "Apurada — pagamento bloqueado até validação jurídica e tributária"
        : "Projeção (não apurada)";
  return {
    ...header("remuneracao", cycle.name),
    stamp: approved ? undefined : "PROJEÇÃO — não garantida",
    summary: [
      { label: approved ? "Resultado líquido apurado" : "Resultado líquido parcial", value: net, kind: "money" },
      {
        label: "Percentual nas regras do ciclo",
        value: rules ? formatPercentBps(rules.adminFeeBps) : "—",
        kind: "text",
      },
      { label: "Remuneração administrativa", value: fee, kind: "money" },
      { label: "Situação", value: status, kind: "text" },
    ],
    sections: [],
    notes: [
      "A remuneração incide somente sobre resultado líquido POSITIVO, nunca sobre o principal contribuído.",
      "Sem resultado positivo, não há remuneração variável. O percentual é o das regras congeladas do ciclo.",
      "O pagamento ao administrador depende de validação jurídica e tributária (recurso desligado por padrão).",
    ],
  };
}

async function distributionReport(cycleId: string): Promise<ReportDoc> {
  const { cycle } = await loadCycle(cycleId);
  const calc = await latestCalculation(cycleId);
  if (!calc) {
    return {
      ...header("distribuicao", cycle.name),
      stamp: "SEM APURAÇÃO",
      summary: [],
      sections: [],
      notes: ["Ainda não há apuração calculada para este ciclo."],
    };
  }
  const totalWeight = calc.shares.reduce((s, x) => s + x.weight, 0n);
  const rows = calc.shares.map((s) => ({
    participante: s.membership.participant.fullName + (s.membership.status === "LEFT" ? " (saiu)" : ""),
    principal: s.principalCents,
    peso: Number(s.weight / 100n), // R$·dia
    participacao: totalWeight > 0n ? Math.round((Number(s.weight) * 10_000) / Number(totalWeight)) / 100 : 0,
    resultado: s.shareCents,
    total: s.principalCents + s.shareCents,
    pagoEm: s.distribution ? toISODate(s.distribution.paidOn) : null,
  }));
  return {
    ...header("distribuicao", cycle.name),
    stamp: calc.status === "APPROVED" ? undefined : "RASCUNHO — apuração ainda não aprovada",
    summary: [
      { label: "Resultado líquido", value: calc.netResultCents, kind: "money" },
      { label: "Remuneração administrativa", value: calc.adminFeeCents, kind: "money" },
      {
        label: calc.netResultCents < 0 ? "Prejuízo rateado" : "Distribuído aos participantes",
        value: calc.netResultCents < 0 ? calc.netResultCents : calc.distributableCents,
        kind: "money",
      },
      { label: "Data de corte", value: toISODate(calc.cutoffDate), kind: "date" },
    ],
    sections: [
      {
        title: "Participação de cada um (saldo diário proporcional)",
        columns: [
          { key: "participante", label: "Participante", kind: "text", width: 3 },
          { key: "principal", label: "Principal", kind: "money" },
          { key: "peso", label: "Peso (R$·dia)", kind: "int" },
          { key: "participacao", label: "Participação %", kind: "percent" },
          { key: "resultado", label: "Resultado", kind: "money" },
          { key: "total", label: "Total a receber", kind: "money" },
          { key: "pagoEm", label: "Pago em", kind: "date" },
        ],
        rows,
        totals: {
          participante: "Total",
          principal: rows.reduce((s, r) => s + r.principal, 0),
          resultado: rows.reduce((s, r) => s + r.resultado, 0),
          total: rows.reduce((s, r) => s + r.total, 0),
        },
      },
    ],
    notes: [
      "Peso = Σ (valor recebido × dias até a data de corte). Pagamentos anteriores ao ciclo contam a partir do início; estornos e devoluções deixam de contar a partir da sua data.",
      "Prejuízo, quando houver, é rateado pelo principal mantido na caixinha. Arredondamento pelo maior resto: a soma fecha exatamente.",
      `Código de integridade da apuração: ${calc.contentHash}.`,
      DISCLAIMER,
    ],
  };
}

async function closingReport(cycleId: string, today: ISODate): Promise<ReportDoc> {
  const { cycle, rules } = await loadCycle(cycleId);
  const [calc, overview, d, adjustments, reconciliation] = await Promise.all([
    latestCalculation(cycleId),
    getLedgerOverview(cycleId),
    getCycleDetail(cycleId, today),
    db.ledgerTransaction.findMany({
      where: { cycleId, postClosing: true },
      orderBy: { occurredOn: "asc" },
      include: { lines: true },
    }),
    db.cashReconciliation.findFirst({
      where: { cycleId },
      orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const distributed = calc?.shares.filter((s) => s.distribution).length ?? 0;
  return {
    ...header("encerramento", cycle.name),
    stamp: cycle.status === "CLOSED" ? undefined : "CICLO AINDA NÃO ENCERRADO",
    summary: [
      {
        label: "Período",
        value: `${formatDateBR(toISODate(cycle.startDate))} a ${formatDateBR(toISODate(cycle.contributionEndDate))}`,
        kind: "text",
      },
      { label: "Participantes", value: d?.memberships.length ?? 0, kind: "int" },
      { label: "Contribuições recebidas", value: d?.totals.receivedCents ?? 0, kind: "money" },
      { label: "Receitas adicionais", value: overview.revenueCents, kind: "money" },
      { label: "Despesas + tributos", value: overview.expenseCents + overview.taxCents, kind: "money" },
      {
        label: "Resultado líquido apurado",
        value: calc?.status === "APPROVED" ? calc.netResultCents : null,
        kind: "money",
      },
      {
        label: "Remuneração administrativa",
        value: calc?.status === "APPROVED" ? calc.adminFeeCents : null,
        kind: "money",
      },
      { label: "Distribuições registradas", value: `${distributed} de ${calc?.shares.length ?? 0}`, kind: "text" },
      { label: "Saldo final em caixa", value: overview.cashCents, kind: "money" },
      {
        label: "Última conciliação (diferença)",
        value: reconciliation ? reconciliation.differenceCents : null,
        kind: "money",
      },
    ],
    sections: [
      {
        title: "Correções pós-encerramento",
        columns: [
          { key: "data", label: "Data", kind: "date" },
          { key: "descricao", label: "Descrição", kind: "text", width: 5 },
          { key: "valor", label: "Efeito no caixa", kind: "money" },
        ],
        rows: adjustments.map((e) => ({
          data: toISODate(e.occurredOn),
          descricao: e.description,
          valor: cash(e.lines),
        })),
        emptyMessage: "Nenhuma correção após o encerramento.",
      },
    ],
    notes: [
      `Regras versão ${rules?.version ?? "—"} · código ${rules?.contentHash ?? "—"}.`,
      calc
        ? `Apuração ${calc.status === "APPROVED" ? "aprovada" : "em rascunho"} · código ${calc.contentHash}.`
        : "Sem apuração.",
      cycle.closedAt ? `Ciclo encerrado em ${formatDateTime(cycle.closedAt)}.` : "Ciclo ainda não encerrado.",
      DISCLAIMER,
    ],
  };
}

async function collectiveReport(cycleId: string, today: ISODate): Promise<ReportDoc> {
  const r = await getCollectiveReport(cycleId, today);
  if (!r) throw new Error("Ciclo não encontrado.");
  const calc = await db.resultCalculation.findFirst({ where: { cycleId, status: "APPROVED" } });
  const months = r.series.filter((p) => p.inCents || p.outCents || p.receivedCents);
  return {
    ...header("prestacao-de-contas", r.cycle.name),
    summary: [
      { label: "Participantes", value: r.participants, kind: "int" },
      { label: "Cotas", value: r.quotas, kind: "int" },
      { label: "Contribuições (principal)", value: r.overview.principalOwedCents, kind: "money" },
      { label: "Receitas adicionais", value: r.overview.revenueCents, kind: "money" },
      { label: "Despesas", value: r.overview.expenseCents, kind: "money" },
      { label: "Tributos e deduções", value: r.overview.taxCents, kind: "money" },
      {
        label: calc ? "Resultado líquido apurado" : "Resultado parcial (não apurado)",
        value: calc ? calc.netResultCents : r.overview.partialResultCents,
        kind: "money",
      },
      { label: "Saldo em caixa", value: r.overview.cashCents, kind: "money" },
    ],
    sections: [
      {
        title: "Movimento mensal do grupo",
        columns: [
          { key: "mes", label: "Mês", kind: "text" },
          { key: "contribuicoes", label: "Contribuições", kind: "money" },
          { key: "entradas", label: "Entradas", kind: "money" },
          { key: "saidas", label: "Saídas", kind: "money" },
        ],
        rows: months.map((p) => ({
          mes: formatCompetence(p.competence),
          contribuicoes: p.receivedCents,
          entradas: p.inCents,
          saidas: p.outCents,
        })),
        emptyMessage: "Sem movimentação.",
      },
      {
        title: "Receitas, despesas e tributos lançados",
        columns: [
          { key: "data", label: "Data", kind: "date" },
          { key: "categoria", label: "Categoria", kind: "text", width: 2 },
          { key: "descricao", label: "Descrição", kind: "text", width: 5 },
          { key: "valor", label: "Efeito no caixa", kind: "money" },
        ],
        rows: r.otherEntries
          .filter((e) => !["DISTRIBUTION", "PRINCIPAL_RETURN"].includes(e.category))
          .map((e) => ({
            data: e.occurredOn,
            categoria: CATEGORY_LABEL[e.category] ?? e.category,
            descricao: e.description,
            valor: e.cashEffectCents,
          })),
        emptyMessage: "Nenhum lançamento além das contribuições.",
      },
    ],
    notes: ["Relatório coletivo: não contém dados pessoais nem valores individuais de participantes.", DISCLAIMER],
  };
}

async function statementReport(membershipId: string): Promise<ReportDoc> {
  const m = await db.membership.findUnique({
    where: { id: membershipId },
    include: {
      participant: { select: { fullName: true } },
      cycle: { select: { name: true } },
      payments: true,
      shares: { where: { calculation: { status: "APPROVED" } }, include: { distribution: true } },
    },
  });
  if (!m) throw new Error("Participação não encontrada.");
  const entries = buildStatement(
    m.payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      status: p.status,
      receivedAt: p.receivedAt ? toISODate(p.receivedAt) : null,
      reversedAt: p.reversedAt ? toISODate(p.reversedAt) : null,
      method: p.method,
    })),
  );
  const share = m.shares[0];
  const rows: ReportSection["rows"] = entries.map((e) => ({
    data: e.date,
    movimento: `${e.kind === "CONTRIBUTION" ? "Contribuição" : "Estorno de contribuição"} · ${PAYMENT_METHOD_LABEL[e.method] ?? e.method}`,
    valor: e.amountCents,
    saldo: e.balanceCents,
  }));
  return {
    ...header("extrato", m.cycle.name, m.participant.fullName),
    summary: [
      { label: "Participante", value: m.participant.fullName, kind: "text" },
      {
        label: "Cotas",
        value: `${m.quotaCount} × ${(m.quotaValueCents / 100).toFixed(2).replace(".", ",")}`,
        kind: "text",
      },
      { label: "Total recebido (confirmado)", value: entries.at(-1)?.balanceCents ?? 0, kind: "money" },
      { label: "Resultado apurado", value: share ? share.shareCents : null, kind: "money" },
      {
        label: "Distribuição paga em",
        value: share?.distribution ? toISODate(share.distribution.paidOn) : null,
        kind: "date",
      },
    ],
    sections: [
      {
        title: "Movimentos",
        columns: [
          { key: "data", label: "Data", kind: "date" },
          { key: "movimento", label: "Movimento", kind: "text", width: 4 },
          { key: "valor", label: "Valor", kind: "money" },
          { key: "saldo", label: "Saldo", kind: "money" },
        ],
        rows,
        emptyMessage: "Nenhum pagamento confirmado.",
      },
    ],
    notes: ["Somente dinheiro efetivamente recebido e conferido. Pagamentos em análise não aparecem.", DISCLAIMER],
  };
}
