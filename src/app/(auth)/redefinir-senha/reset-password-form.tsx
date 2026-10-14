"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/modules/auth/auth-client";

const MIN = 10;

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password.length < MIN) return setError(`A senha precisa ter ao menos ${MIN} caracteres.`);
    if (password !== confirm) return setError("As senhas não conferem.");

    setError(null);
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (error) {
      setError("Não foi possível redefinir. O link pode ter expirado — solicite um novo.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Alert tone="success" title="Senha definida!">
        <Link href="/login" className="font-semibold underline">
          Entrar agora
        </Link>
      </Alert>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Nova senha" name="password" type="password" autoComplete="new-password" minLength={MIN} required />
      <Field label="Confirme a nova senha" name="confirm" type="password" autoComplete="new-password" required />
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Salvar nova senha
      </Button>
    </form>
  );
}
