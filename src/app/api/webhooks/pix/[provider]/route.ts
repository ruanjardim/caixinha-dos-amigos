import { after } from "next/server";
import { env } from "@/lib/env";
import { notifyPixEvent } from "@/modules/notifications/service";
import { MAX_WEBHOOK_BYTES, processWebhook } from "@/modules/pix/service";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER } from "@/modules/pix/signature";

export const runtime = "nodejs";

/**
 * Webhook do provedor Pix: POST /api/webhooks/pix/<provedor>
 * Autenticado SOMENTE pela assinatura HMAC (sem sessão/cookies). Só o provedor configurado
 * em PIX_PROVIDER é aceito; os demais respondem "não encontrado".
 */
export async function POST(request: Request, { params }: RouteContext<"/api/webhooks/pix/[provider]">) {
  const { provider } = await params;
  if (provider !== env.PIX_PROVIDER) return Response.json({ ok: false }, { status: 404 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_WEBHOOK_BYTES) return Response.json({ ok: false }, { status: 413 });

  const result = await processWebhook({
    provider,
    rawBody: await request.text(),
    signature: request.headers.get(SIGNATURE_HEADER),
    timestamp: request.headers.get(TIMESTAMP_HEADER),
  });

  if (result.eventRowId && result.notifyAdmins) {
    const eventRowId = result.eventRowId;
    after(async () => {
      try {
        await notifyPixEvent(eventRowId);
      } catch (e) {
        console.error("[notificacao]", e);
      }
    });
  }
  return Response.json(
    { ok: result.httpStatus < 300, outcome: result.outcome },
    { status: result.httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
