import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { isCaixinhaManager } from "@/modules/auth/permissions";
import { getCurrentUser, homePathFor } from "@/modules/auth/session";
import { DisableTwoFactor, TwoFactorSetup } from "./two-factor-setup";

export const metadata = { title: "Verificação em duas etapas" };

export default async function TwoFactorPage() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") redirect("/login");
  const home = homePathFor(user);
  const required =
    isCaixinhaManager(user) && Boolean(user.twoFactorPending || user.twoFactorEnabled);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-extrabold tracking-tight">Verificação em duas etapas</h1>
        <p className="text-muted">
          Além da senha, um código de 6 dígitos gerado no seu celular (Google Authenticator, Microsoft Authenticator,
          Authy ou similar). Quem descobrir a sua senha, sozinho, não consegue entrar.
        </p>
      </div>

      {user.twoFactorEnabled ? (
        <>
          <Alert tone="success">A verificação em duas etapas está ativa na sua conta.</Alert>
          {!required && <DisableTwoFactor />}
          <Link href={home} className="text-brand-700 block text-center text-sm font-semibold hover:underline">
            Voltar para a caixinha
          </Link>
        </>
      ) : (
        <>
          {user.twoFactorPending && (
            <Alert tone="warning" title="Obrigatória para administradores">
              Para proteger o dinheiro do grupo, ative a verificação em duas etapas antes de acessar a administração.
            </Alert>
          )}
          <TwoFactorSetup homePath={home} />
          {!user.twoFactorPending && (
            <Link href={home} className="text-muted block text-center text-sm font-semibold hover:underline">
              Agora não
            </Link>
          )}
        </>
      )}
    </div>
  );
}
