import { RecoverAccessForm } from "./recover-access-form";

export const metadata = { title: "Recuperar acesso", robots: { index: false, follow: false } };

export default async function RecoverPasswordPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  return <RecoverAccessForm initialMode={tipo === "autenticador" ? "authenticator" : "password"} />;
}
