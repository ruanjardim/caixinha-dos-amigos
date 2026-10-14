import { AppShell } from "@/components/layout/app-shell";
import { requirePagePermission } from "@/modules/auth/session";

export default async function ParticipantLayout({ children }: LayoutProps<"/minha-caixinha">) {
  const user = await requirePagePermission("self.dashboard");
  return (
    <AppShell menu="participant" user={user}>
      {children}
    </AppShell>
  );
}
