import { db } from "@/lib/db";
import { readUpload } from "@/modules/files/service";
import { canViewParticipant } from "@/modules/auth/permissions";
import { getCurrentUser } from "@/modules/auth/session";

/**
 * Download de comprovante com verificação de permissão:
 * administrador, ou o próprio participante dono do pagamento.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/arquivos/[id]">) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return new Response("Não autorizado", { status: 401 });

  const { id } = await params;
  const file = await db.fileUpload.findUnique({
    where: { id },
    include: { payments: { select: { membership: { select: { participantId: true } } } } },
  });
  // Mesmo erro para "não existe" e "sem permissão": não revela a existência do arquivo.
  const notFound = new Response("Arquivo não encontrado", { status: 404 });
  if (!file) return notFound;

  const allowed =
    user.role === "ADMIN" ||
    file.uploadedById === user.userId ||
    file.payments.some((p) => canViewParticipant(user, p.membership.participantId));
  if (!allowed) return notFound;

  const bytes = await readUpload(file.storageKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
