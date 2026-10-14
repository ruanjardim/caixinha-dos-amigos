import { timingSafeEqual } from "node:crypto";
import { todayInBrazil } from "@/domain/dates";
import { env } from "@/lib/env";
import { recordAudit } from "@/modules/audit/audit";
import { cleanupOrphanUploads } from "@/modules/files/service";
import { sendDueReminders } from "@/modules/notifications/service";
import { expireCharges } from "@/modules/pix/service";

export const runtime = "nodejs";

function authorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Tarefa diária (agendador externo, 1x ao dia): expira cobranças Pix vencidas, envia
 * lembretes de vencimento e remove comprovantes órfãos. Protegida por "Authorization: Bearer <CRON_SECRET>".
 * Pode rodar mais de uma vez no mesmo dia: cada aviso tem chave única e não se repete.
 */
async function run(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const expiredCharges = await expireCharges(new Date());
  const reminders = await sendDueReminders(todayInBrazil());
  const orphanUploads = await cleanupOrphanUploads(new Date());
  await recordAudit({
    actorId: null,
    action: "job.daily",
    entityType: "Job",
    after: { expiredCharges, reminders, orphanUploads },
  });
  return Response.json(
    { ok: true, expiredCharges, reminders, orphanUploads },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = run;
export const POST = run;
