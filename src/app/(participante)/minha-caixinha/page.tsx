import Link from "next/link";
import { CalendarClock, FileSignature, HandCoins, Info, Megaphone, PiggyBank } from "lucide-react";
import { ContributionSummaryGrid, InstallmentsTable, SummaryCard } from "@/components/finance/contributions";
import { PAYMENT_METHOD_LABEL, PaymentStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { MoneyLegend, MoneyValue } from "@/components/ui/money-value";
import { formatCompetence, formatDateBR, toISODate } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { firstName } from "@/lib/format";
import { recentAnnouncementForParticipant } from "@/modules/announcements/service";
import { getOwnResult } from "@/modules/results/queries";
import { requirePagePermission } from "@/modules/auth/session";
import { getOwnMemberships } from "@/modules/cycles/queries";

export const metadata = { title: "Minha Caixinha" };

export default async function MyCaixinhaPage({ searchParams }: PageProps<"/minha-caixinha">) {
  const user = await requirePagePermission("self.dashboard");
  const params = await searchParams;

  // Somente os dados do PRÓPRIO participante (escopo pelo usuário logado).
  const memberships = user.participantId ? await getOwnMemberships(user.participantId) : [];
  const current = memberships.find((m) => m.cycle.status !== "CLOSED") ?? memberships[0];
  const recent = await recentAnnouncementForParticipant(user.participantId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Olá, {firstName(user.name)}!</h1>
        <p className="text-muted">Minha Caixinha{current ? ` · ${current.cycle.name}` : ""}</p>
      </header>

      {recent && (
        <Link
          href="/minha-caixinha/comunicados"
          className="border-line bg-surface hover:bg-canvas flex items-start gap-3 rounded-xl border p-3.5 text-sm"
        >
          <Megaphone className="text-brand-600 mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block font-semibold">{recent.title}</span>
            <span className="text-muted line-clamp-1">{recent.body}</span>
          </span>
        </Link>
      )}

      {params.informado === "1" && (
        <Alert tone="success" title="Pagamento informado!">
          Ele aparece como “em análise” até a administração conferir no extrato.
        </Alert>
      )}

      {!user.participantId ? (
        <Alert tone="warning" title="Cadastro de participante não vinculado">
          Seu acesso ainda não está ligado a um cadastro de participante. Fale com a administração.
        </Alert>
      ) : !current ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="bg-brand-50 text-brand-600 grid size-14 place-items-center rounded-2xl">
              <PiggyBank className="size-7" aria-hidden />
            </span>
            <p className="font-semibold">Você ainda não está em um ciclo</p>
            <p className="text-muted max-w-xs text-sm">
              Quando a administração incluir você em um ciclo, suas cotas e mensalidades aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <CurrentMembership m={current} result={await getOwnResult(current.id)} />
      )}

      <Card>
        <CardContent className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Info className="text-brand-600 size-4" aria-hidden /> Como ler os valores
          </p>
          <MoneyLegend />
          <p className="text-muted text-xs">
            A caixinha não promete rendimento. Resultados só existem quando apurados ao final do ciclo, conforme as
            regras aprovadas pelo grupo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

type OwnMembership = Awaited<ReturnType<typeof getOwnMemberships>>[number];

function CurrentMembership({ m, result }: { m: OwnMembership; result: Awaited<ReturnType<typeof getOwnResult>> }) {
  const rules = m.cycle.rules[0];
  const needsAcceptance = Boolean(rules?.frozenAt) && rules.acceptances.length === 0;
  const isDraft = m.cycle.status === "DRAFT";
  const canPay = m.cycle.status === "OPEN" || m.cycle.status === "CONTRIBUTIONS_CLOSED";
  const next = m.summary.nextDue;

  return (
    <>
      {needsAcceptance && (
        <Alert tone="warning" title="Regras do ciclo publicadas">
          Leia e registre o seu aceite.{" "}
          <Link href="/minha-caixinha/regras" className="font-semibold underline">
            Ver regras
          </Link>
        </Alert>
      )}

      <Card className="bg-brand-700 overflow-hidden border-0 text-white">
        <CardContent className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="space-y-1">
            <p className="text-sm text-white/85">
              {m.quotaCount} cota(s) de {formatBRL(m.quotaValueCents)} · mensalidade{" "}
              <strong className="text-white">{formatBRL(m.quotaCount * m.quotaValueCents)}</strong>
            </p>
            <p className="text-sm text-white/85">Total recebido (confirmado)</p>
            <p className="tabular text-3xl font-extrabold">{formatBRL(m.summary.receivedCents)}</p>
            {next ? (
              <p className="flex items-center gap-1.5 text-sm text-white/85">
                <CalendarClock className="size-4" aria-hidden />
                Próximo vencimento: {formatDateBR(next.dueDate)} ({formatCompetence(next.competence)}) —{" "}
                {formatBRL(next.remainingCents)}
              </p>
            ) : !isDraft ? (
              <p className="text-sm text-white/85">Todas as parcelas do ciclo estão cobertas. 🎉</p>
            ) : null}
          </div>
          {canPay && (
            <LinkButton href="/minha-caixinha/informar-pagamento" variant="secondary" className="text-brand-800">
              <HandCoins className="size-4" aria-hidden /> Informar pagamento
            </LinkButton>
          )}
        </CardContent>
      </Card>

      {/* Três naturezas de valor, sempre separadas: recebido, apurado e (nenhuma) projeção individual. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-muted text-xs font-semibold">Total depositado (confirmado)</p>
          <MoneyValue cents={m.summary.receivedCents} kind="received" className="mt-1 block text-xl" />
        </Card>
        <Card className="p-4">
          <p className="text-muted text-xs font-semibold">Resultados atribuídos</p>
          <MoneyValue cents={result?.shareCents ?? 0} kind="calculated" className="mt-1 block text-xl" />
          <p className="text-muted mt-1 text-xs">
            {result
              ? result.distribution
                ? `Pago em ${formatDateBR(toISODate(result.distribution.paidOn))} (com o principal).`
                : "Apurado e aprovado; pagamento no encerramento."
              : "Apurados só ao final do ciclo, conforme as regras."}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-muted text-xs font-semibold">Saldo demonstrativo</p>
          <MoneyValue
            cents={(result ? result.principalCents : m.summary.receivedCents) + (result?.shareCents ?? 0)}
            className="mt-1 block text-xl"
          />
          <p className="text-muted mt-1 text-xs">Depositado + resultados já apurados.</p>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/minha-caixinha/extrato" className="text-brand-700 font-semibold hover:underline">
          Extrato e recibos
        </Link>
        <span className="text-line">·</span>
        <Link href="/minha-caixinha/prestacao-de-contas" className="text-brand-700 font-semibold hover:underline">
          Prestação de contas do grupo
        </Link>
      </div>

      {isDraft ? (
        <Alert tone="info">O ciclo ainda está em preparação. As parcelas aparecerão quando ele for aberto.</Alert>
      ) : (
        <>
          {m.summary.overdueCount > 0 && (
            <Alert tone="error" title="Há parcelas em atraso">
              {m.summary.overdueCount} parcela(s), total de {formatBRL(m.summary.overdueCents)}.
            </Alert>
          )}
          <ContributionSummaryGrid summary={m.summary} monthlyCents={m.quotaCount * m.quotaValueCents} />
          <SummaryCard title="Minhas parcelas">
            <InstallmentsTable installments={m.summary.installments} />
          </SummaryCard>
        </>
      )}

      <SummaryCard title="Meus pagamentos">
        {m.payments.length === 0 ? (
          <p className="text-muted p-5 text-sm">Nenhum pagamento registrado ainda.</p>
        ) : (
          <ul className="divide-line divide-y">
            {m.payments.map((p) => (
              <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3">
                <div className="min-w-0">
                  <MoneyValue cents={p.amountCents} kind={p.status === "CONFIRMED" ? "received" : "neutral"} />
                  <p className="text-muted text-xs">
                    {PAYMENT_METHOD_LABEL[p.method]} · {p.receivedAt ? formatDateBR(toISODate(p.receivedAt)) : "—"}
                    {p.cancelReason ? ` · Motivo: ${p.cancelReason}` : ""}
                  </p>
                </div>
                <PaymentStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>

      {rules?.frozenAt && !needsAcceptance && (
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <FileSignature className="size-3.5" aria-hidden /> Você aceitou as regras deste ciclo.{" "}
          <Link href="/minha-caixinha/regras" className="underline">
            Ver regras
          </Link>
        </p>
      )}
    </>
  );
}
