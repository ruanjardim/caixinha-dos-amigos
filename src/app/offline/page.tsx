import { WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export const metadata = { title: "Sem conexão" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo />
      <WifiOff className="text-muted size-10" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Você está sem conexão</h1>
        <p className="text-muted">
          Por segurança, os valores da caixinha só são exibidos com conexão ativa — assim você nunca vê um saldo
          desatualizado.
        </p>
      </div>
    </main>
  );
}
