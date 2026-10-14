import { FileSpreadsheet, FileText } from "lucide-react";
import { cn } from "@/lib/cn";

/** Botão de download de relatório (PDF ou Excel). */
export function DownloadLink({ href, icon }: { href: string; icon: "pdf" | "xlsx" }) {
  const Icon = icon === "pdf" ? FileText : FileSpreadsheet;
  return (
    <a
      href={href}
      className="border-line hover:bg-canvas inline-flex h-9 items-center gap-1.5 rounded-xl border bg-white px-3 text-sm font-semibold"
    >
      <Icon className={cn("size-4", icon === "pdf" ? "text-danger" : "text-brand-700")} aria-hidden />
      {icon === "pdf" ? "PDF" : "Excel"}
    </a>
  );
}
