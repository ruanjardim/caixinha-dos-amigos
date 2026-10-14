import { AppShell } from "@/components/layout/app-shell";
import { requirePagePermission } from "@/modules/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePagePermission("dashboard.admin");
  return (
    <AppShell menu="admin" user={user}>
      {children}
    </AppShell>
  );
}
