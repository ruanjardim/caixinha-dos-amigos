import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Definir nova senha" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const invalid = typeof params.error === "string" || !token;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-extrabold tracking-tight">Definir nova senha</h1>
        <p className="text-muted">Use ao menos 10 caracteres. Uma frase fácil de lembrar é uma ótima opção.</p>
      </div>
      {invalid ? (
        <Alert tone="error" title="Link inválido ou expirado">
          Solicite um novo link em{" "}
          <Link href="/recuperar-senha" className="font-semibold underline">
            recuperar acesso
          </Link>
          .
        </Alert>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </div>
  );
}
