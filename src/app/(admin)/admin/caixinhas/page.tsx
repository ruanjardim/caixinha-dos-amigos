import { Boxes, CalendarRange, Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/modules/auth/session";
import { switchCaixinhaAction } from "@/modules/caixinhas/actions";
import { listCaixinhasForUser } from "@/modules/caixinhas/service";

export const metadata = { title: "Minhas caixinhas" };

const ROLE_LABEL = { OWNER: "Responsável", ADMIN: "Administrador", PARTICIPANT: "Participante" } as const;

export default async function CaixinhasPage() {
  const user = await requirePagePermission("dashboard.admin");
  const memberships = await listCaixinhasForUser(user.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Grupos separados e seguros"
        title="Minhas caixinhas"
        description="Crie uma caixinha para cada grupo. Participantes, ciclos e movimentações não se misturam."
        actions={
          <LinkButton href="/admin/caixinhas/nova">
            <Plus className="size-4" aria-hidden /> Nova caixinha
          </LinkButton>
        }
      />

      {memberships.length === 0 ? (
        <Card>
          <EmptyState icon={<Boxes className="size-7" />} title="Você ainda não tem uma caixinha">
            Crie a primeira para começar a cadastrar participantes e preparar o ciclo.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {memberships.map(({ caixinha, role }) => (
            <Card key={caixinha.id} className={user.caixinhaId === caixinha.id ? "border-brand-500" : undefined}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle className="truncate">{caixinha.name}</CardTitle>
                  <p className="text-muted mt-1 text-sm">{caixinha.description || "Sem descrição."}</p>
                </div>
                <Badge tone={user.caixinhaId === caixinha.id ? "green" : "gray"}>
                  {user.caixinhaId === caixinha.id ? "Em uso" : ROLE_LABEL[role]}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-canvas rounded-xl p-3">
                    <dt className="text-muted flex items-center gap-1.5">
                      <Users className="size-4" aria-hidden /> Participantes
                    </dt>
                    <dd className="mt-1 text-xl font-bold">{caixinha._count.participants}</dd>
                  </div>
                  <div className="bg-canvas rounded-xl p-3">
                    <dt className="text-muted flex items-center gap-1.5">
                      <CalendarRange className="size-4" aria-hidden /> Ciclos
                    </dt>
                    <dd className="mt-1 text-xl font-bold">{caixinha._count.cycles}</dd>
                  </div>
                </dl>
                {user.caixinhaId === caixinha.id ? (
                  <LinkButton href="/admin" variant="secondary" className="w-full justify-center">
                    Abrir painel
                  </LinkButton>
                ) : (
                  <form action={switchCaixinhaAction}>
                    <input type="hidden" name="caixinhaId" value={caixinha.id} />
                    <button
                      type="submit"
                      className="border-line hover:bg-brand-50 hover:text-brand-800 min-h-11 w-full rounded-xl border px-4 text-sm font-semibold"
                    >
                      Usar esta caixinha
                    </button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

