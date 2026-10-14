import { Info, PiggyBank } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyLegend } from "@/components/ui/money-value";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/modules/auth/session";

export const metadata = { title: "Minha Caixinha" };

export default async function MyCaixinhaPage() {
  const user = await requirePagePermission("self.dashboard");

  // Somente os dados do PRÓPRIO participante (escopo pelo usuário logado).
  const membershipCount = user.participantId
    ? await db.membership.count({ where: { participantId: user.participantId } })
    : 0;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Olá, {user.name.split(" ")[0]}!</h1>
        <p className="text-muted">Minha Caixinha</p>
      </header>

      {!user.participantId ? (
        <Alert tone="warning" title="Cadastro de participante não vinculado">
          Seu acesso ainda não está ligado a um cadastro de participante. Fale com a administração.
        </Alert>
      ) : membershipCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="bg-brand-50 text-brand-600 grid size-14 place-items-center rounded-2xl">
              <PiggyBank className="size-7" aria-hidden />
            </span>
            <p className="font-semibold">Você ainda não está em um ciclo ativo</p>
            <p className="text-muted max-w-xs text-sm">
              Quando a administração abrir o ciclo, suas cotas, mensalidades e pagamentos aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Alert tone="info">Seu resumo financeiro completo será exibido aqui (Fase 3).</Alert>
      )}

      <Card>
        <CardContent className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Info className="text-brand-600 size-4" aria-hidden /> Como ler os valores
          </p>
          <MoneyLegend />
          <p className="text-muted text-xs">
            A caixinha não promete rendimento. Resultados só existem quando apurados ao final do ciclo, conforme as
            regras aprovadas pelo grupo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
