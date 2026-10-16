import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BottomNav, SideNav } from "@/components/layout/nav-links";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { signOutAction } from "@/modules/auth/actions";
import type { UserCaixinha } from "@/modules/auth/session";
import { isCaixinhaManager } from "@/modules/auth/permissions";
import { switchCaixinhaAction } from "@/modules/caixinhas/actions";

type ShellUser = {
  name: string;
  email: string;
  role: string;
  caixinhaId?: string | null;
  caixinhaName?: string | null;
  caixinhaRole?: UserCaixinha["role"] | null;
  caixinhas?: UserCaixinha[];
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function AppShell({
  menu,
  user,
  children,
}: {
  menu: "admin" | "participant";
  user: ShellUser;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="border-line bg-surface sticky top-0 hidden h-dvh flex-col gap-6 border-r p-5 lg:flex">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="px-1">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <CaixinhaSwitcher caixinhas={user.caixinhas ?? []} activeId={user.caixinhaId ?? null} />
        <div className="flex-1 overflow-y-auto">
          <SideNav menu={menu} />
        </div>
        <UserBox user={user} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="border-line bg-surface/95 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            {user.caixinhaName && (
              <span className="text-ink-soft max-w-24 truncate text-xs font-semibold sm:max-w-44">
                {user.caixinhaName}
              </span>
            )}
            <ThemeToggle />
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-muted hover:bg-canvas grid size-11 place-items-center rounded-xl"
                aria-label="Sair"
              >
                <LogOut className="size-5" aria-hidden />
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-10 lg:py-10 lg:pb-10">
          {children}
        </main>
      </div>

      <BottomNav menu={menu} />
    </div>
  );
}

function CaixinhaSwitcher({
  caixinhas,
  activeId,
}: {
  caixinhas: UserCaixinha[];
  activeId: string | null;
}) {
  if (caixinhas.length === 0) {
    return (
      <Link
        href="/caixinhas/nova"
        className="border-brand-300 bg-brand-50 text-brand-800 rounded-xl border px-3 py-2.5 text-sm font-semibold"
      >
        + Criar primeira caixinha
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <form action={switchCaixinhaAction} className="space-y-1.5">
        <label htmlFor="shell-caixinha" className="text-muted text-xs font-semibold tracking-wide uppercase">
          Caixinha em uso
        </label>
        <div className="flex gap-2">
          <select
            id="shell-caixinha"
            name="caixinhaId"
            defaultValue={activeId ?? caixinhas[0]?.id}
            className="border-line bg-canvas text-ink min-w-0 flex-1 rounded-xl border px-2.5 text-sm font-semibold"
          >
            {caixinhas.map((caixinha) => (
              <option key={caixinha.id} value={caixinha.id}>
                {caixinha.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-brand-700 min-h-11 rounded-xl px-3 text-xs font-bold text-white hover:bg-brand-800"
          >
            Trocar
          </button>
        </div>
      </form>
      <Link href="/caixinhas" className="text-brand-700 block text-xs font-semibold hover:underline">
        Ver ou criar caixinhas
      </Link>
    </div>
  );
}

function UserBox({ user }: { user: ShellUser }) {
  const roleLabel = isCaixinhaManager({ role: user.role === "ADMIN" ? "ADMIN" : "PARTICIPANT", caixinhaRole: user.caixinhaRole })
    ? user.caixinhaRole === "OWNER"
      ? "Responsável"
      : "Administrador"
    : "Participante";
  return (
    <div className="border-line bg-canvas/60 flex items-center gap-3 rounded-xl border p-3">
      <span className="bg-brand-100 text-brand-800 grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold">
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.name}</p>
        <p className="text-muted truncate text-xs">{roleLabel}</p>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          className="text-muted hover:bg-canvas hover:text-danger grid size-8 place-items-center rounded-lg"
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}
