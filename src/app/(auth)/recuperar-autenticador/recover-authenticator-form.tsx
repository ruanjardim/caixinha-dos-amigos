"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { recoverAuthenticatorAction } from "@/modules/auth/email-recovery-actions";

export function RecoverAuthenticatorForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(recoverAuthenticatorAction, {});
  if (state.ok)
    return (
      <Alert tone="success" title="Acesso recuperado">
        Entre com sua nova senha e configure um novo autenticador para acessar a administração.
        <Link href="/login" className="mt-2 block font-semibold underline">
          Entrar novamente
        </Link>
      </Alert>
    );

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="token" value={token} />
      <Field
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        maxLength={128}
        error={state.fieldErrors?.password?.[0]}
        required
      />
      <Field
        label="Confirme a nova senha"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={10}
        maxLength={128}
        error={state.fieldErrors?.confirm?.[0]}
        required
      />
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Confirmar recuperação
      </Button>
    </form>
  );
}
