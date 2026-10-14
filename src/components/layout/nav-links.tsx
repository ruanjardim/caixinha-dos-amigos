"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ADMIN_NAV, PARTICIPANT_NAV, type NavItem } from "@/components/layout/nav";

const MENUS = { admin: ADMIN_NAV, participant: PARTICIPANT_NAV } as const;

function isActive(pathname: string, item: NavItem, root: string) {
  return item.href === root ? pathname === root : pathname.startsWith(item.href);
}

/** Navegação lateral (desktop). */
export function SideNav({ menu }: { menu: keyof typeof MENUS }) {
  const pathname = usePathname();
  const items = MENUS[menu];
  const root = items[0].href;
  return (
    <nav className="flex flex-col gap-1" aria-label="Menu principal">
      {items.map((item) => {
        const active = isActive(pathname, item, root);
        const Icon = item.icon;
        if (!item.available) {
          return (
            <span
              key={item.href}
              className="text-muted/60 flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
              title="Disponível nas próximas fases"
            >
              <Icon className="size-[18px] shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
              <span className="bg-canvas ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                em breve
              </span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              active ? "bg-brand-50 text-brand-800" : "text-ink-soft hover:bg-canvas",
            )}
          >
            <Icon className={cn("size-[18px]", active && "text-brand-600")} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra de navegação inferior (celular). */
export function BottomNav({ menu }: { menu: keyof typeof MENUS }) {
  const pathname = usePathname();
  const all = MENUS[menu];
  const root = all[0].href;
  const items = all.filter((i) => i.available).slice(0, 5);
  return (
    <nav
      className="safe-bottom border-line fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur lg:hidden"
      aria-label="Menu principal"
    >
      <ul className="mx-auto flex max-w-md justify-around pt-2">
        {items.map((item) => {
          const active = isActive(pathname, item, root);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-16 flex-col items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold",
                  active ? "text-brand-700" : "text-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
