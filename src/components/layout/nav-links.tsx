"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
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
              "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              active ? "bg-brand-700 text-white shadow-sm" : "text-ink-soft hover:bg-brand-50 hover:text-ink",
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
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
  const [open, setOpen] = useState(false);
  const all = MENUS[menu];
  const root = all[0].href;
  const available = all.filter((item) => item.available);
  const items = available.slice(0, 4);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          />
          <section
            id="mobile-full-menu"
            className="border-line bg-surface absolute inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] max-h-[70dvh] overflow-y-auto rounded-2xl border p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="mobile-menu-title" className="font-bold">
                Menu completo
              </h2>
              <button
                type="button"
                className="text-muted hover:bg-canvas grid size-11 place-items-center rounded-xl"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {available.map((item) => {
                const active = isActive(pathname, item, root);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "border-line flex min-h-14 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                      active
                        ? "bg-brand-700 border-brand-700 text-white"
                        : "bg-surface text-ink-soft hover:bg-brand-50",
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <nav
        className="safe-bottom border-line bg-surface/95 fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur lg:hidden"
        aria-label="Menu principal"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2 pt-2">
          {items.map((item) => {
            const active = isActive(pathname, item, root);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold",
                    active ? "bg-brand-700 text-white" : "text-muted hover:bg-brand-50 hover:text-ink",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className={cn(
                "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold",
                open ? "bg-brand-700 text-white" : "text-muted hover:bg-brand-50 hover:text-ink",
              )}
              aria-expanded={open}
              aria-controls="mobile-full-menu"
            >
              {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
              Mais
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
