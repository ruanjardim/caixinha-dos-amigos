"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/modules/auth/auth-client";

export default function RecoverPasswordPage() {
  const [sent, setSent] = useState(false);
  const [limited, setLimited] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "")
      .trim()
      .toLowerCase();
    setPending(true);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/redefinir-senha" });
    setPending(false);
    setLimited(error?.status === 429);
    // Mesma resposta exista ou não o e-mail (evita descobrir quem participa).
    if (!error || error.status !== 429) setSent(true);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-extrabold tracking-tight">Recuperar acesso</h1>
        <p className="text-muted">Informe seu e-mail para receber um link de nova senha.</p>
      </div>

      {sent ? (
        <Alert tone="success" title="Pedido recebido">
          Se o e-mail estiver cadastrado, você receberá um link válido por 1 hora.
        </Alert>
      ) : (
        <form method="post" onSubmit={onSubmit} className="space-y-4">
          {limited && <Alert tone="warning">Muitos pedidos seguidos. Aguarde alguns minutos.</Alert>}
          <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required />
          <Button type="submit" className="w-full" size="lg" loading={pending}>
            Enviar link
          </Button>
        </form>
      )}

      <p className="text-center text-sm">
        <Link href="/login" className="text-brand-700 font-semibold hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
