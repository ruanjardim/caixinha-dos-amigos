import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const tones = {
  green: "bg-brand-50 text-brand-700 ring-brand-200",
  blue: "bg-info-bg text-info ring-blue-200",
  amber: "bg-warning-bg text-warning ring-amber-200",
  red: "bg-danger-bg text-danger ring-red-200",
  gray: "bg-canvas text-ink-soft ring-line",
} as const;

export function Badge({
  tone = "gray",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
