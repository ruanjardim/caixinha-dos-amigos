import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { RecoverAuthenticatorForm } from "./recover-authenticator-form";

export const metadata = {
  title: "Recuperar autenticador",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function RecoverAuthenticatorPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Recuperar autenticador</h1>
      {token && /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token) ? (
        <>
          <p className="text-muted">
            Defina uma nova senha para confirmar a recuperação. Suas sessões, o autenticador antigo e os códigos de
            reserva serão invalidados. Depois, configure um novo autenticador antes de acessar a administração.
          </p>
          <RecoverAuthenticatorForm token={token} />
        </>
      ) : (
        <Alert tone="warning">Link inválido ou incompleto. Solicite a recuperação novamente.</Alert>
      )}
      <Link
        href="/recuperar-senha?tipo=autenticador"
        className="text-brand-700 block text-center text-sm font-semibold hover:underline"
      >
        Solicitar outro link por e-mail
      </Link>
    </div>
  );
}
