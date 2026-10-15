"use client";

/**
 * Gráficos financeiros (Recharts). Especificação visual (skill de dataviz):
 * barras ≤ 24px com ponta arredondada de 4px; linhas de 2px; marcadores ≥ 8px com
 * anel da cor da superfície; grade em linha fina sólida; tooltip com o VALOR em
 * destaque; cores validadas para daltonismo (verde × violeta; cinza = contexto).
 * Valores em CENTAVOS; a formatação acontece só na exibição.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatBRL } from "@/domain/money";

const C = {
  in: "#60702f",
  out: "#4a3aa7",
  context: "#8a9692",
  grid: "#e3e9e6",
  axis: "#c3c2b7",
  muted: "#66746e",
  surface: "#ffffff",
};

const compact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Eixo: centavos → "R$ 1,2 mil" (zero negativo normalizado). */
function axisMoney(cents: number) {
  return compact.format(Math.round(cents) / 100 + 0).replace(/ /g, " ");
}

const axisProps = {
  tick: { fill: C.muted, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: C.axis },
} as const;

type Row = { label: string } & Record<string, number | string>;
type SeriesDef = { key: string; name: string; color: string; kind: "bar" | "line" | "area"; signed?: boolean };

function ChartTooltip({ active, payload, label, series }: TooltipContentProps & { series: SeriesDef[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-line bg-surface rounded-xl border px-3 py-2 text-sm shadow-[var(--shadow-card)]">
      <p className="text-muted mb-1 text-xs font-semibold">{label}</p>
      <ul className="space-y-0.5">
        {series.map((s) => {
          const item = payload.find((p) => p.dataKey === s.key);
          if (!item || item.value === null || item.value === undefined) return null;
          const value = Number(item.value ?? 0);
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="tabular text-ink font-bold">
                {formatBRL(Math.round(s.signed ? Math.abs(value) : value) + 0)}
              </span>
              <span className="text-muted">{s.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Frame({ height = 260, label, children }: { height?: number; label: string; children: React.ReactElement }) {
  return (
    <div role="img" aria-label={label} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Contribuições: recebido (colunas, verde) × previsto (linha cinza de contexto). */
/** `expectedCents: null` = mês fora do ciclo (sem obrigação): a linha não é desenhada ali. */
export function ContributionsChart({
  data,
}: {
  data: { label: string; receivedCents: number; expectedCents: number | null }[];
}) {
  const series: SeriesDef[] = [
    { key: "receivedCents", name: "Recebido", color: C.in, kind: "bar" },
    { key: "expectedCents", name: "Previsto", color: C.context, kind: "line" },
  ];
  const hasNegative = data.some((d) => d.receivedCents < 0);
  return (
    <Frame label="Gráfico de contribuições recebidas e previstas por mês">
      <ComposedChart data={data as Row[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} axisLine={false} width={72} tickFormatter={axisMoney} />
        {hasNegative && <ReferenceLine y={0} stroke={C.axis} />}
        <Tooltip cursor={{ fill: "rgba(15,26,22,0.04)" }} content={(p) => <ChartTooltip {...p} series={series} />} />
        <Bar
          dataKey="receivedCents"
          name="Recebido"
          fill={C.in}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          dataKey="expectedCents"
          name="Previsto"
          type="linear"
          stroke={C.context}
          strokeWidth={2}
          dot={{ r: 4, fill: C.context, stroke: C.surface, strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: C.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </Frame>
  );
}

/** Entradas (para cima, verde) × saídas (para baixo, violeta) — mesmo eixo, base zero. */
export function CashFlowChart({ data }: { data: { label: string; inCents: number; outCents: number }[] }) {
  const rows = data.map((d) => ({ label: d.label, inCents: d.inCents, outCents: -d.outCents }));
  const series: SeriesDef[] = [
    { key: "inCents", name: "Entradas", color: C.in, kind: "bar" },
    { key: "outCents", name: "Saídas", color: C.out, kind: "bar", signed: true },
  ];
  return (
    <Frame label="Gráfico de entradas e saídas do caixa por mês">
      <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} axisLine={false} width={72} tickFormatter={(v: number) => axisMoney(Math.abs(v))} />
        <ReferenceLine y={0} stroke={C.axis} />
        <Tooltip cursor={{ fill: "rgba(15,26,22,0.04)" }} content={(p) => <ChartTooltip {...p} series={series} />} />
        <Bar
          dataKey="inCents"
          name="Entradas"
          stackId="fluxo"
          fill={C.in}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        <Bar
          dataKey="outCents"
          name="Saídas"
          stackId="fluxo"
          fill={C.out}
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </Frame>
  );
}

/** Resultado parcial acumulado (série única: sem legenda, o título nomeia). */
export function CumulativeResultChart({ data }: { data: { label: string; cumulativeResultCents: number }[] }) {
  const series: SeriesDef[] = [
    { key: "cumulativeResultCents", name: "Resultado parcial acumulado", color: C.in, kind: "area" },
  ];
  return (
    <Frame label="Gráfico do resultado parcial acumulado do ciclo" height={220}>
      <AreaChart data={data as Row[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} axisLine={false} width={72} tickFormatter={axisMoney} />
        <ReferenceLine y={0} stroke={C.axis} />
        <Tooltip cursor={{ stroke: C.axis, strokeWidth: 1 }} content={(p) => <ChartTooltip {...p} series={series} />} />
        <Area
          dataKey="cumulativeResultCents"
          type="linear"
          stroke={C.in}
          strokeWidth={2}
          fill={C.in}
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 5, fill: C.in, stroke: C.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </Frame>
  );
}
