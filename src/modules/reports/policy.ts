/**
 * Quem pode emitir cada relatório (regra pura, testável).
 * - Consolidados (com dados individuais): só administração.
 * - Prestação de contas coletiva: administração ou participante DO ciclo.
 * - Extrato individual: o próprio participante, ou a administração.
 */
import { canViewParticipant, hasPermission, type Actor } from "@/modules/auth/permissions";
import type { ReportType } from "./types";

export type ReportContext = {
  /** O ator participa do ciclo pedido? */
  isMemberOfCycle: boolean;
  /** Dono da participação pedida (só para o extrato). */
  statementParticipantId?: string | null;
};

export function canEmitReport(actor: Actor | null, type: ReportType, ctx: ReportContext): boolean {
  if (!actor || actor.status !== "ACTIVE") return false;
  switch (type) {
    case "prestacao-de-contas":
      return (
        hasPermission(actor, "reports.consolidated") ||
        (hasPermission(actor, "reports.collective") && ctx.isMemberOfCycle)
      );
    case "extrato":
      return (
        hasPermission(actor, "self.statement") &&
        !!ctx.statementParticipantId &&
        canViewParticipant(actor, ctx.statementParticipantId)
      );
    default:
      return hasPermission(actor, "reports.consolidated");
  }
}
