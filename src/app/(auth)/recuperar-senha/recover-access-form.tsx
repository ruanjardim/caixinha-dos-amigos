"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { authClient } from "@/modules/auth/auth-client";
import { requestAuthenticatorRecoveryAction } from "@/modules/auth/email-recovery-actions";

type Mode = "password" | "authenticator";

export function RecoverAccessForm({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const email = String(new FormData(event.currentTarget).get("email") ?? "")
      .trim()
      .toLowerCase();
    setPending(true);
    setError(null);
    try {
      if (mode === "authenticator") {
        const result = await requestAuthenticatorRecoveryAction(email);
        if (!result.ok) {
          setError(result.error ?? "Não foi possível solicitar a recuperação. Tente novamente.");
          return;
        }
      } else {
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/redefinir-senha" });
        if (error) {
          setError(
            error.status === 429
              ? "Muitos pedidos seguidos. Aguarde alguns minutos."
              : "Não foi possível solicitar o link. Tente novamente.",
          );
          return;
        }
      }
      setSent(true);
    } catch {
      setError("Não foi possível conectar. Confira sua conexão e tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-extrabold tracking-tight">Recuperar acesso</h1>
        <p className="text-muted">Receba um link de recuperação no e-mail cadastrado na sua conta.</p>
      </div>
      {sent ? (
        <Alert tone="info" title="Pedido recebido">
          {mode === "authenticator"
            ? "Se houver uma conta ativa com autenticador nesse e-mail, enviaremos um link válido por 15 minutos."
            : "Se o e-mail estiver cadastrado, você receberá um link válido por 1 hora."}{" "}
          Confira também a pasta de spam.
        </Alert>
      ) : (
        <form method="post" onSubmit={onSubmit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <SelectField
            label="O que você precisa recuperar?"
            name="mode"
            value={mode}
            disabled={pending}
            onChange={(event) => {
              setMode(event.target.value as Mode);
              setError(null);
            }}
            options={[
              { value: "password", label: "Esqueci minha senha" },
              { value: "authenticator", label: "Perdi acesso ao autenticador" },
            ]}
          />
          <Field
            label="E-mail da conta"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            required
          />
          {mode === "authenticator" && (
            <p className="text-muted text-sm">
              Ao confirmar pelo e-mail, você definirá uma nova senha e poderá configurar um novo aplicativo
              autenticador.
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" loading={pending}>
            Enviar link por e-mail
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
