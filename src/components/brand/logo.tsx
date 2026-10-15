import { cn } from "@/lib/cn";

/**
 * Logotipo: duas moedas (os amigos) caindo numa caixinha sorridente.
 * Símbolo funciona sozinho como ícone de app.
 */
export function LogoMark({ className, title = "Caixinha dos Amigos" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label={title} className={cn("size-10", className)}>
      <rect width="48" height="48" rx="12" fill="#60702f" />
      {/* moedas / amigos */}
      <circle cx="19.5" cy="12" r="5" fill="#d3d9a8" />
      <circle cx="28.5" cy="12" r="5" fill="#ffffff" />
      <circle cx="28.5" cy="12" r="5" fill="none" stroke="#60702f" strokeWidth="1.5" />
      {/* tampa com fenda */}
      <rect x="8.5" y="19" width="31" height="6" rx="2.5" fill="#ffffff" />
      <rect x="18" y="21" width="12" height="2" rx="1" fill="#4d5a27" />
      {/* corpo da caixinha */}
      <path d="M11 26h26v9.5a3.5 3.5 0 0 1-3.5 3.5h-19A3.5 3.5 0 0 1 11 35.5z" fill="#ffffff" />
      {/* sorriso */}
      <path d="M19 30.5q5 4 10 0" fill="none" stroke="#60702f" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-9 shrink-0" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-ink text-[0.95rem] font-extrabold tracking-tight">CAIXINHA</span>
          <span className="text-brand-600 text-[0.7rem] font-semibold tracking-[0.18em]">DOS AMIGOS</span>
        </span>
      )}
    </span>
  );
}
