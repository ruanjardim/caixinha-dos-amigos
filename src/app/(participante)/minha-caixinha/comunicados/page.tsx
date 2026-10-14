import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/format";
import { listAnnouncementsForParticipant } from "@/modules/announcements/service";
import { requirePagePermission } from "@/modules/auth/session";

export const metadata = { title: "Comunicados" };

export default async function AnnouncementsPage() {
  const user = await requirePagePermission("announcements.read");
  const items = await listAnnouncementsForParticipant(user.participantId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Comunicados" description="Avisos da administração para o grupo." />
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone className="size-7" />} title="Nenhum comunicado por enquanto" />
        </Card>
      ) : (
        <ul className="space-y-4">
          {items.map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold">{a.title}</h2>
                    {a.cycle && <Badge tone="gray">{a.cycle.name}</Badge>}
                  </div>
                  <p className="text-muted text-xs">{a.publishedAt ? formatDateTime(a.publishedAt) : ""}</p>
                  {/* Texto simples: nada é interpretado como HTML. */}
                  <p className="text-ink-soft text-sm leading-relaxed whitespace-pre-line">{a.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
