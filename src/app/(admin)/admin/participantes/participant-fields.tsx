import { Field } from "@/components/ui/field";
import { formatPhone } from "@/lib/format";

export function ParticipantFields({
  defaults,
}: {
  defaults?: { fullName: string; email: string; phone: string | null; joinedAt: string };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Nome completo" name="fullName" autoComplete="off" required defaultValue={defaults?.fullName} />
      </div>
      <Field
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        required
        defaultValue={defaults?.email}
        hint="Usado para o acesso ao sistema."
      />
      <Field
        label="Telefone (opcional)"
        name="phone"
        type="tel"
        inputMode="tel"
        placeholder="(11) 91234-5678"
        defaultValue={defaults?.phone ? formatPhone(defaults.phone) : ""}
      />
      <Field label="Data de entrada no grupo" name="joinedAt" type="date" required defaultValue={defaults?.joinedAt} />
    </div>
  );
}
