import {
  BarChart3,
  BookOpenCheck,
  CalendarRange,
  FileText,
  HandCoins,
  Home,
  Megaphone,
  PartyPopper,
  Receipt,
  ScrollText,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Fase em que o item será entregue; itens futuros aparecem desabilitados. */
  available: boolean;
};

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Painel", icon: BarChart3, available: true },
  { href: "/admin/participantes", label: "Participantes", icon: Users, available: false },
  { href: "/admin/ciclos", label: "Ciclos e cotas", icon: CalendarRange, available: false },
  { href: "/admin/pagamentos", label: "Pagamentos", icon: HandCoins, available: false },
  { href: "/admin/livro-caixa", label: "Livro-caixa", icon: BookOpenCheck, available: false },
  { href: "/admin/resultados", label: "Resultados", icon: Wallet, available: false },
  { href: "/admin/arrecadacao", label: "Arrecadação", icon: PartyPopper, available: false },
  { href: "/admin/relatorios", label: "Relatórios", icon: FileText, available: false },
  { href: "/admin/comunicados", label: "Comunicados", icon: Megaphone, available: false },
  { href: "/admin/auditoria", label: "Auditoria", icon: ShieldCheck, available: true },
];

export const PARTICIPANT_NAV: NavItem[] = [
  { href: "/minha-caixinha", label: "Início", icon: Home, available: true },
  { href: "/minha-caixinha/extrato", label: "Extrato", icon: Receipt, available: false },
  { href: "/minha-caixinha/prestacao-de-contas", label: "Contas", icon: ScrollText, available: false },
  { href: "/minha-caixinha/comunicados", label: "Avisos", icon: Megaphone, available: false },
];
