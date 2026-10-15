import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-canvas",
  ghost: "text-ink-soft hover:bg-brand-50 hover:text-brand-800",
} as const;

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof variants; size?: "sm" | "md" }) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors",
        size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-[0.95rem]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
