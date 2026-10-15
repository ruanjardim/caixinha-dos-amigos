"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark";

const STORAGE_KEY = "caixinha-theme";
const THEME_EVENT = "caixinha-theme-change";

function preferredTheme(): Theme {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#151811" : "#60702f");
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(THEME_EVENT, onChange);
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Theme>(subscribe, preferredTheme, () => "light");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const isDark = theme === "dark";
  const label = isDark ? "Ativar tema claro" : "Ativar tema escuro";

  function toggleTheme() {
    const next: Theme = isDark ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "border-line bg-surface text-ink-soft hover:bg-brand-50 hover:text-ink grid size-11 shrink-0 place-items-center rounded-xl border transition-colors",
        className,
      )}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
    >
      {isDark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}
