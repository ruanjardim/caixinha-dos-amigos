import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/modules/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user?.status === "ACTIVE") redirect(homePathFor(user));

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-extrabold tracking-tight">Entrar</h1>
        <p className="text-muted">Acesse a sua caixinha com o e-mail cadastrado.</p>
      </div>
      <LoginForm />
    </div>
  );
}
