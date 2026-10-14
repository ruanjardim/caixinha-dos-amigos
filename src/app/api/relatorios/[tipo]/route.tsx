import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { recordAudit } from "@/modules/audit/audit";
import { getCurrentUser } from "@/modules/auth/session";
import { buildReport } from "@/modules/reports/data";
import { canEmitReport } from "@/modules/reports/policy";
import { ReportPdf } from "@/modules/reports/report-pdf";
import { reportToXlsx } from "@/modules/reports/report-xlsx";
import { isReportType } from "@/modules/reports/types";

export const runtime = "nodejs";

/**
 * Relatórios em PDF ou Excel: /api/relatorios/<tipo>?ciclo=<id>&formato=pdf|xlsx[&participacao=<id>]
 * Permissão verificada no servidor; sem permissão = "não encontrado". Toda emissão é auditada.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/relatorios/[tipo]">) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return new Response("Não autorizado", { status: 401 });

  const { tipo } = await params;
  const url = new URL(request.url);
  const cycleId = url.searchParams.get("ciclo") ?? "";
  const format = url.searchParams.get("formato") === "xlsx" ? "xlsx" : "pdf";
  const notFound = new Response("Relatório não encontrado", { status: 404 });
  if (!isReportType(tipo) || !cycleId) return notFound;

  const cycle = await db.cycle.findUnique({ where: { id: cycleId }, select: { id: true } });
  if (!cycle) return notFound;

  const ownMembership = user.participantId
    ? await db.membership.findUnique({
        where: { participantId_cycleId: { participantId: user.participantId, cycleId } },
      })
    : null;

  let membershipId: string | undefined;
  let statementParticipantId: string | null = null;
  if (tipo === "extrato") {
    const requested = url.searchParams.get("participacao");
    const m = requested ? await db.membership.findUnique({ where: { id: requested } }) : ownMembership;
    if (!m || m.cycleId !== cycleId) return notFound;
    membershipId = m.id;
    statementParticipantId = m.participantId;
  }

  if (!canEmitReport(user, tipo, { isMemberOfCycle: Boolean(ownMembership), statementParticipantId })) return notFound;

  const doc = await buildReport(tipo, cycleId, { membershipId });
  await recordAudit({
    actorId: user.userId,
    action: "report.export",
    entityType: "Cycle",
    entityId: cycleId,
    after: { tipo, formato: format, membershipId: membershipId ?? null },
  });

  const body = format === "xlsx" ? await reportToXlsx(doc) : await renderToBuffer(<ReportPdf doc={doc} />);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type":
        format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.fileName}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
