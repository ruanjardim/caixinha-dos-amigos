import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BottomNav, SideNav } from "@/components/layout/nav-links";
import { signOutAction } from "@/modules/auth/actions";

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
  user: { name: string; email: string; role: string };
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-line sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-white p-5 lg:flex">
        <Link href="/" className="px-1">
          <Logo />
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SideNav menu={menu} />
        </div>
        <UserBox user={user} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="border-line sticky top-0 z-20 flex items-center justify-between border-b bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/">
            <Logo />
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-muted hover:bg-canvas grid size-10 place-items-center rounded-xl"
              aria-label="Sair"
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-10 lg:py-10 lg:pb-10">
          {children}
        </main>
      </div>

      <BottomNav menu={menu} />
    </div>
  );
}

function UserBox({ user }: { user: { name: string; email: string; role: string } }) {
  return (
    <div className="border-line flex items-center gap-3 rounded-xl border p-3">
      <span className="bg-brand-100 text-brand-800 grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold">
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.name}</p>
        <p className="text-muted truncate text-xs">{user.role === "ADMIN" ? "Administrador" : "Participante"}</p>
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
