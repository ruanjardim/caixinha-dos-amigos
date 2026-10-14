import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const tones = {
  info: { box: "bg-info-bg text-info border-blue-200", Icon: Info },
  success: { box: "bg-brand-50 text-brand-800 border-brand-200", Icon: CheckCircle2 },
  warning: { box: "bg-warning-bg text-warning border-amber-200", Icon: AlertTriangle },
  error: { box: "bg-danger-bg text-danger border-red-200", Icon: XCircle },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
    </div>
  );
}
