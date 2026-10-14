import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  eyebrow,
  back,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      {back && (
        <Link
          href={back.href}
          className="text-muted hover:text-brand-700 inline-flex items-center gap-1.5 text-sm font-semibold"
        >
          <ArrowLeft className="size-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          {eyebrow && <p className="text-brand-700 text-sm font-semibold">{eyebrow}</p>}
          <h1 className="text-2xl font-extrabold tracking-tight break-words sm:text-3xl">{title}</h1>
          {description && <p className="text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <span className="bg-brand-50 text-brand-600 grid size-14 place-items-center rounded-2xl">{icon}</span>}
      <p className="font-semibold">{title}</p>
      {children && <div className="text-muted max-w-sm text-sm">{children}</div>}
    </div>
  );
}
