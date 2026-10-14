import { Field, TextareaField } from "@/components/ui/field";

export type CycleDefaults = {
  name: string;
  startDate: string;
  contributionEndDate: string;
  settlementDate: string;
  dueDay: number;
  adminFeePercent: string;
  quotaValues: string;
  rulesText: string;
};

export function CycleFields({ defaults }: { defaults: CycleDefaults }) {
  return (
    <div className="space-y-5">
      <Field label="Nome do ciclo" name="name" required defaultValue={defaults.name} placeholder="Ciclo 2026/2027" />

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">Datas</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Início" name="startDate" type="date" required defaultValue={defaults.startDate} />
          <Field
            label="Fim das contribuições"
            name="contributionEndDate"
            type="date"
            required
            defaultValue={defaults.contributionEndDate}
          />
          <Field
            label="Prestação de contas"
            name="settlementDate"
            type="date"
            required
            defaultValue={defaults.settlementDate}
          />
        </div>
        <div className="max-w-[220px]">
          <Field
            label="Dia de vencimento"
            name="dueDay"
            type="number"
            min={1}
            max={28}
            required
            defaultValue={defaults.dueDay}
            hint="Entre 1 e 28."
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">Cotas e remuneração</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Valores de cota (R$)"
            name="quotaValues"
            required
            defaultValue={defaults.quotaValues}
            hint='Separe com ";" — ex.: 50; 100'
          />
          <Field
            label="Remuneração administrativa (%)"
            name="adminFeePercent"
            inputMode="decimal"
            required
            defaultValue={defaults.adminFeePercent}
            hint="Sobre o resultado líquido POSITIVO. Nunca sobre o principal."
          />
        </div>
      </fieldset>

      <TextareaField
        label="Texto das regras"
        name="rulesText"
        rows={12}
        defaultValue={defaults.rulesText}
        hint="Deixe em branco para usar o texto padrão gerado a partir dos dados acima. Ele será apresentado aos participantes para aceite."
      />
    </div>
  );
}
