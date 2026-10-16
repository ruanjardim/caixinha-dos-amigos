import { db } from "@/lib/db";
import { readUpload } from "@/modules/files/service";
import { canViewParticipant, hasPermission } from "@/modules/auth/permissions";
import { getCurrentUser } from "@/modules/auth/session";

/**
 * Arquivos protegidos, com verificação de permissão:
 * - comprovante de pagamento: administrador ou o próprio participante dono do pagamento;
 * - imagem de atividade: administrador ou participante do ciclo da atividade;
 * - demais (ex.: documentos de conformidade): somente administrador ou quem enviou.
 * `?inline=1` exibe imagens na página; o resto é sempre baixado como anexo.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/arquivos/[id]">) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return new Response("Não autorizado", { status: 401 });

  const { id } = await params;
  const file = await db.fileUpload.findUnique({
    where: { id },
    include: {
      payments: {
        select: { membership: { select: { participantId: true, cycle: { select: { caixinhaId: true } } } } },
      },
      activityImages: {
        select: { activity: { select: { cycleId: true, status: true, cycle: { select: { caixinhaId: true } } } } },
      },
    },
  });
  // Mesmo erro para "não existe" e "sem permissão": não revela a existência do arquivo.
  const notFound = new Response("Arquivo não encontrado", { status: 404 });
  if (!file) return notFound;

  const belongsToActiveCaixinha =
    !user.caixinhaId ||
    file.payments.some((p) => p.membership.cycle.caixinhaId === user.caixinhaId) ||
    file.activityImages.some((image) => image.activity.cycle.caixinhaId === user.caixinhaId);
  let allowed =
    // Pela matriz de permissões (admin com 2FA pendente não passa) e pela caixinha selecionada.
    (hasPermission(user, "participants.manage") && belongsToActiveCaixinha) ||
    file.uploadedById === user.userId ||
    file.payments.some((p) => canViewParticipant(user, p.membership.participantId));

  if (!allowed && user.participantId && file.activityImages.length > 0) {
    const visible = file.activityImages.filter((i) =>
      ["PLANNED", "IN_PROGRESS", "FINISHED"].includes(i.activity.status),
    );
    if (visible.length > 0) {
      allowed =
        (await db.membership.count({
          where: { participantId: user.participantId, cycleId: { in: visible.map((i) => i.activity.cycleId) } },
        })) > 0;
    }
  }
  if (!allowed) return notFound;

  const inline = new URL(request.url).searchParams.has("inline") && file.contentType.startsWith("image/");
  const bytes = await readUpload(file.storageKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
