import { getCurrentUser } from "@/modules/auth/session";
import { hasPermission } from "@/modules/auth/permissions";
import { exportParticipantData } from "@/modules/privacy/service";

export const runtime = "nodejs";

/**
 * LGPD — exportação dos dados do titular em JSON.
 * Participante: somente os PRÓPRIOS dados. Administração: ?participante=<id>, a pedido do titular.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return new Response("Não autorizado", { status: 401 });

  const requested = new URL(request.url).searchParams.get("participante");
  const participantId = requested && hasPermission(user, "participants.manage") ? requested : user.participantId;
  if (!participantId) return new Response("Não encontrado", { status: 404 });
  if (requested && requested !== participantId) return new Response("Não encontrado", { status: 404 });

  const data = await exportParticipantData(user, participantId);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-caixinha-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
