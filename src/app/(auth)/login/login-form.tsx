"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/modules/auth/auth-client";
import { twoFactorErrorMessage, TWO_FACTOR_CONNECTION_ERROR } from "@/modules/auth/two-factor-feedback";

type Step = "password" | "code";

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function finish() {
    router.replace("/");
    router.refresh();
  }

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    setPending(true);
    const { data, error } = await authClient.signIn.email({
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
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setStep("code");
      return;
    }
    finish();
  }

  async function onCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!code || (!useBackupCode && !/^\d{6}$/.test(code))) {
      setError(
        useBackupCode ? "Informe o código de recuperação." : "Informe os seis dígitos do código do autenticador.",
      );
      return;
    }
    setPending(true);
    try {
      const { error } = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        setError(twoFactorErrorMessage(error));
        return;
      }
      window.location.replace("/");
    } catch {
      setError(TWO_FACTOR_CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }

  if (step === "code") {
    return (
      <form method="post" onSubmit={onCode} className="space-y-4" noValidate>
        <Alert tone="info" title="Verificação em duas etapas">
          {useBackupCode
            ? "Digite um dos códigos de recuperação que você guardou. Cada código só pode ser usado uma vez."
            : "Abra o aplicativo autenticador e digite o código de 6 dígitos da Caixinha dos Amigos."}
        </Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          key={useBackupCode ? "backup" : "totp"}
          label={useBackupCode ? "Código de recuperação" : "Código de 6 dígitos"}
          name="code"
          inputMode={useBackupCode ? "text" : "numeric"}
          autoComplete="one-time-code"
          pattern={useBackupCode ? undefined : "[0-9]*"}
          maxLength={useBackupCode ? 32 : 12}
          hint={useBackupCode ? undefined : "Pode colar os seis dígitos com ou sem espaço."}
          autoFocus
          required
        />
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Confirmar
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <button
            type="button"
            className="text-brand-700 font-semibold hover:underline"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setError(null);
            }}
          >
            {useBackupCode ? "Usar o aplicativo autenticador" : "Usar um código de recuperação"}
          </button>
          <button
            type="button"
            className="text-muted font-semibold hover:underline"
            onClick={() => {
              setStep("password");
              setError(null);
            }}
          >
            Voltar
          </button>
        </div>
        <Link
          href="/recuperar-senha?tipo=autenticador"
          className="text-brand-700 block text-center text-sm font-semibold hover:underline"
        >
          Perdi acesso ao autenticador — recuperar por e-mail
        </Link>
      </form>
    );
  }

  return (
    <form method="post" onSubmit={onPassword} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="E-mail" name="email" type="email" autoComplete="email" inputMode="email" required />
      <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Entrar
      </Button>
      <p className="text-center text-sm">
        <Link href="/recuperar-senha" className="text-brand-700 font-semibold hover:underline">
          Esqueci minha senha ou perdi o autenticador
        </Link>
      </p>
    </form>
  );
}
