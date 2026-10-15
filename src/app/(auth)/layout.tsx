import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="bg-brand-700 relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="bg-brand-500/40 pointer-events-none absolute -top-24 -right-24 size-96 rounded-full blur-3xl"
          aria-hidden
        />
        <div className="bg-surface/95 relative inline-flex self-start rounded-2xl px-3 py-2">
          <Logo />
        </div>
        <div className="relative max-w-md space-y-4">
          <h1 className="text-4xl leading-tight font-extrabold">Nossa caixinha, com transparência de ponta a ponta.</h1>
          <p className="text-brand-100 text-lg">
            Cada contribuição registrada, cada real explicado. Organização para quem administra, clareza para quem
            participa.
          </p>
        </div>
        <p className="text-brand-100 relative flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4" aria-hidden />
          Grupo privado · acesso somente por convite
        </p>
      </aside>

      <main className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
