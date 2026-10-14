import { Field, MoneyField, SelectField, TextareaField } from "@/components/ui/field";
import { ACTIVITY_TYPE_LABEL } from "@/components/finance/status-badges";

export type ActivityDefaults = {
  type: string;
  title: string;
  description: string;
  startsOn: string;
  endsOn: string;
  numberRangeStart: string;
  numberRangeEnd: string;
  unitPrice: string;
  promotionRules: string;
};

export function ActivityFields({
  defaults,
  cycles,
  lockType = false,
}: {
  defaults: ActivityDefaults;
  cycles?: { id: string; name: string }[];
  lockType?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {cycles && (
          <SelectField label="Ciclo" name="cycleId" options={cycles.map((c) => ({ value: c.id, label: c.name }))} />
        )}
        {lockType ? (
          <input type="hidden" name="type" value={defaults.type} />
        ) : (
          <SelectField
            label="Tipo"
            name="type"
            defaultValue={defaults.type}
            options={Object.entries(ACTIVITY_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            hint="Sorteios começam sempre em simulação, sem venda."
          />
        )}
      </div>
      <Field label="Título" name="title" required defaultValue={defaults.title} />
      <TextareaField label="Descrição (opcional)" name="description" rows={3} defaultValue={defaults.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Início (opcional)" name="startsOn" type="date" defaultValue={defaults.startsOn} />
        <Field label="Fim (opcional)" name="endsOn" type="date" defaultValue={defaults.endsOn} />
      </div>
      <fieldset className="border-line space-y-3 rounded-xl border p-4">
        <legend className="px-1 text-sm font-bold">Somente para sorteios</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Número inicial"
            name="numberRangeStart"
            type="number"
            min={0}
            defaultValue={defaults.numberRangeStart}
          />
          <Field
            label="Número final"
            name="numberRangeEnd"
            type="number"
            min={0}
            defaultValue={defaults.numberRangeEnd}
            hint="Até 10.000 números."
          />
          <MoneyField label="Preço por número (R$)" name="unitPriceCents" defaultValue={defaults.unitPrice} />
        </div>
        <TextareaField
          label="Regulamento da promoção"
          name="promotionRules"
          rows={5}
          defaultValue={defaults.promotionRules}
          hint="Obrigatório para o parecer de conformidade. Alterar o regulamento após o parecer exige nova análise."
        />
      </fieldset>
    </div>
  );
}
