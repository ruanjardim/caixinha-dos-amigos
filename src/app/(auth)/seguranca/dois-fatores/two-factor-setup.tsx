"use client";

import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient } from "@/modules/auth/auth-client";

type Setup = { qr: string; secret: string; backupCodes: string[] };

/** Ativação em 2 passos: senha → (QR + códigos de recuperação) → código do aplicativo. */
export function TwoFactorSetup({ homePath }: { homePath: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    const { data, error } = await authClient.twoFactor.enable({ password });
    if (error || !data || !("totpURI" in data) || !data.totpURI) {
      setPending(false);
      setError(error?.status === 429 ? "Muitas tentativas. Aguarde alguns segundos." : "Senha incorreta.");
      return;
    }
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    const qr = await QRCode.toDataURL(data.totpURI, { errorCorrectionLevel: "M", margin: 1, width: 220 });
    setSetup({ qr, secret, backupCodes: data.backupCodes ?? [] });
    setPending(false);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    setPending(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      setError(
        error.status === 429
          ? "Muitas tentativas. Aguarde alguns segundos."
          : "Código inválido. Confira se o horário do celular está automático e tente de novo.",
      );
      return;
    }
    router.replace(homePath);
    router.refresh();
  }

  if (!setup) {
    return (
      <form method="post" onSubmit={start} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Confirme a sua senha" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Começar
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>No aplicativo autenticador, adicione uma conta e leia o QR Code.</li>
        <li>Guarde os códigos de recuperação em lugar seguro (fora do celular).</li>
        <li>Digite o código de 6 dígitos que aparece no aplicativo.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado no navegador (data URL) */}
      <img
        src={setup.qr}
        alt="QR Code para o aplicativo autenticador"
        width={200}
        height={200}
        className="border-line mx-auto rounded-xl border bg-white p-2"
      />
      <p className="text-muted text-center text-xs">
        Sem câmera? Digite a chave manualmente:
        <span className="text-ink mt-1 block font-mono text-sm break-all select-all" data-testid="totp-secret">
          {setup.secret}
        </span>
      </p>

      <div className="border-line rounded-xl border p-3">
        <p className="text-sm font-semibold">Códigos de recuperação</p>
        <p className="text-muted text-xs">
          Use um deles se perder o celular. Cada código vale uma vez. Eles não serão mostrados de novo.
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm" data-testid="backup-codes">
          {setup.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand-600 size-4"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />
          Guardei os códigos de recuperação
        </label>
      </div>

      <form method="post" onSubmit={confirm} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="Código de 6 dígitos"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
        <Button type="submit" className="w-full" size="lg" loading={pending} disabled={!saved}>
          Ativar verificação em duas etapas
        </Button>
      </form>
    </div>
  );
}

/** Participantes podem desligar (administradores, não — bloqueado também no servidor). */
export function DisableTwoFactor() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    const { error } = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (error) {
      setError(error.status === 403 ? (error.message ?? "Não permitido.") : "Senha incorreta.");
      return;
    }
    router.refresh();
  }

  return (
    <form method="post" onSubmit={onSubmit} className="border-line space-y-3 rounded-xl border p-4" noValidate>
      <p className="text-sm font-semibold">Desativar</p>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" variant="secondary" className="w-full" loading={pending}>
        Desativar verificação em duas etapas
      </Button>
    </form>
  );
}
