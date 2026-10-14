import "server-only";
import { toISODate } from "@/domain/dates";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { outstandingPrincipal } from "@/modules/results/service";

/**
 * LGPD — direitos do titular.
 * - Acesso/portabilidade: exportação dos dados do PRÓPRIO participante (ou pela administração, a pedido dele).
 * - Eliminação: dados pessoais são substituídos (anonimização). Registros financeiros e a trilha de
 *   auditoria são mantidos pelo prazo legal (obrigação legal e prestação de contas ao grupo).
 */

const date = (d: Date | null) => (d ? toISODate(d) : null);

export async function exportParticipantData(actor: CurrentUser, participantId: string) {
  const p = await db.participant.findUnique({
    where: { id: participantId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          role: true,
          status: true,
          emailNotifications: true,
          twoFactorEnabled: true,
          createdAt: true,
        },
      },
      memberships: {
        include: {
          cycle: { select: { name: true, startDate: true, contributionEndDate: true, status: true } },
          installments: { orderBy: { competence: "asc" } },
          payments: { orderBy: { createdAt: "asc" } },
          changes: { orderBy: { createdAt: "asc" } },
          shares: { include: { calculation: { select: { status: true, cutoffDate: true } } } },
        },
      },
      acceptances: {
        include: { cycleRules: { select: { version: true, contentHash: true, cycle: { select: { name: true } } } } },
      },
      raffleNumbers: { include: { activity: { select: { title: true } } } },
      activityEntries: { include: { activity: { select: { title: true } } } },
    },
  });
  if (!p) throw new DomainError("Participante não encontrado.");

  const notifications = p.userId
    ? await db.notification.findMany({
        where: { userId: p.userId },
        orderBy: { createdAt: "asc" },
        select: { kind: true, subject: true, status: true, createdAt: true },
      })
    : [];

  const data = {
    geradoEm: new Date().toISOString(),
    aviso:
      "Dados pessoais e financeiros do titular na Caixinha dos Amigos (LGPD, art. 18). " +
      "Valores em centavos de real. Registros financeiros são mantidos pelo prazo legal.",
    cadastro: {
      nome: p.fullName,
      email: p.email,
      telefone: p.phone,
      noGrupoDesde: date(p.joinedAt),
      situacao: p.status,
      anonimizadoEm: p.anonymizedAt?.toISOString() ?? null,
    },
    acesso: p.user
      ? {
          nome: p.user.name,
          email: p.user.email,
          perfil: p.user.role,
          situacao: p.user.status,
          avisosPorEmail: p.user.emailNotifications,
          verificacaoEmDuasEtapas: p.user.twoFactorEnabled,
          criadoEm: p.user.createdAt.toISOString(),
        }
      : null,
    participacoes: p.memberships.map((m) => ({
      ciclo: m.cycle.name,
      situacaoDoCiclo: m.cycle.status,
      cotas: m.quotaCount,
      valorDaCotaCentavos: m.quotaValueCents,
      entrada: date(m.joinedAt),
      saida: date(m.leftAt),
      parcelas: m.installments.map((i) => ({
        competencia: i.competence,
        vencimento: date(i.dueDate),
        valorCentavos: i.expectedCents,
        cancelada: Boolean(i.cancelledAt),
      })),
      pagamentos: m.payments.map((pay) => ({
        valorCentavos: pay.amountCents,
        dataDoCredito: date(pay.receivedAt),
        forma: pay.method,
        referencia: pay.transactionRef,
        situacao: pay.status,
        observacoes: pay.notes,
        informadoEm: pay.createdAt.toISOString(),
      })),
      alteracoesDeCotas: m.changes.map((c) => ({
        de: { cotas: c.previousQuotaCount, valorCentavos: c.previousQuotaValueCts },
        para: { cotas: c.newQuotaCount, valorCentavos: c.newQuotaValueCts },
        aPartirDe: date(c.effectiveFrom),
        motivo: c.reason,
      })),
      resultados: m.shares.map((s) => ({
        apuracao: s.calculation.status,
        dataDeCorte: date(s.calculation.cutoffDate),
        principalCentavos: s.principalCents,
        resultadoCentavos: s.shareCents,
      })),
    })),
    aceitesDeRegras: p.acceptances.map((a) => ({
      ciclo: a.cycleRules.cycle.name,
      versao: a.cycleRules.version,
      hashDoTexto: a.cycleRules.contentHash,
      aceitoEm: a.acceptedAt.toISOString(),
    })),
    atividades: p.activityEntries.map((e) => ({ atividade: e.activity.title })),
    numerosDeSorteio: p.raffleNumbers.map((r) => ({
      atividade: r.activity.title,
      numero: r.number,
      situacao: r.status,
    })),
    avisosRecebidos: notifications.map((n) => ({
      tipo: n.kind,
      assunto: n.subject,
      situacao: n.status,
      em: n.createdAt.toISOString(),
    })),
  };

  await recordAudit({
    actorId: actor.userId,
    action: "participant.data_export",
    entityType: "Participant",
    entityId: participantId,
    after: { byAdmin: actor.participantId !== participantId },
  });
  return data;
}

/** Motivos que impedem a anonimização (vazio = pode anonimizar). */
export async function anonymizationBlockers(participantId: string): Promise<string[]> {
  const memberships = await db.membership.findMany({
    where: { participantId },
    include: { cycle: { select: { name: true, status: true } } },
  });
  const blockers: string[] = [];
  for (const m of memberships) {
    if (m.cycle.status === "CLOSED") continue;
    if (m.status === "LEFT" && (await outstandingPrincipal(db, m.id)) === 0) continue;
    blockers.push(`Participa do ${m.cycle.name}, que ainda não foi encerrado (ou tem valores a devolver).`);
  }
  return blockers;
}

export async function anonymizeParticipant(actor: CurrentUser, input: { participantId: string; reason: string }) {
  const blockers = await anonymizationBlockers(input.participantId);
  if (blockers.length > 0) throw new DomainError(blockers[0]);

  await db.$transaction(async (tx) => {
    const p = await tx.participant.findUnique({ where: { id: input.participantId } });
    if (!p) throw new DomainError("Participante não encontrado.");
    if (p.anonymizedAt) throw new DomainError("Este cadastro já foi anonimizado.");
    if (p.userId && p.userId === actor.userId) throw new DomainError("Você não pode anonimizar o próprio cadastro.");

    const tag = p.id.slice(-6);
    const placeholderEmail = `anonimizado-${p.id}@anonimizado.invalid`;
    await tx.participant.update({
      where: { id: p.id },
      data: {
        fullName: `Participante anonimizado ${tag}`,
        email: placeholderEmail,
        phone: null,
        status: "INACTIVE",
        anonymizedAt: new Date(),
      },
    });
    if (p.userId) {
      // Sem credenciais, sem sessões, sem 2FA: a conta deixa de existir para fins de acesso.
      await tx.session.deleteMany({ where: { userId: p.userId } });
      await tx.account.deleteMany({ where: { userId: p.userId } });
      await tx.twoFactor.deleteMany({ where: { userId: p.userId } });
      await tx.user.update({
        where: { id: p.userId },
        data: {
          name: `Participante anonimizado ${tag}`,
          email: placeholderEmail,
          image: null,
          status: "SUSPENDED",
          emailNotifications: false,
          twoFactorEnabled: false,
        },
      });
      await tx.notification.updateMany({ where: { userId: p.userId }, data: { email: placeholderEmail } });
    }
    await tx.notification.updateMany({ where: { email: p.email }, data: { email: placeholderEmail } });
    // Links de redefinição de senha pendentes deixam de valer.
    if (p.userId) await tx.verification.deleteMany({ where: { value: p.userId } });

    await recordAudit(
      {
        actorId: actor.userId,
        action: "participant.anonymize",
        entityType: "Participant",
        entityId: p.id,
        // Sem os dados pessoais antigos: o registro de auditoria não pode reintroduzi-los.
        after: { anonymized: true },
        reason: input.reason,
      },
      tx,
    );
  });
}
