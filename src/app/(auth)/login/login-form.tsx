"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/modules/auth/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    setPending(true);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);

    if (error) {
      // Mensagem genérica: não revela se o e-mail existe.
      setError(
        error.status === 429
          ? "Muitas tentativas. Aguarde um minuto e tente novamente."
          : "E-mail ou senha incorretos.",
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Entrar
      </Button>
      <p className="text-center text-sm">
        <Link href="/recuperar-senha" className="text-brand-700 font-semibold hover:underline">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}
