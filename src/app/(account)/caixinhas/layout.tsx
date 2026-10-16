import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { hasPermission } from "@/modules/auth/permissions";
import { requireUser } from "@/modules/auth/session";

export default async function CaixinhasLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell menu={hasPermission(user, "dashboard.admin") ? "admin" : "participant"} user={user}>
      {children}
    </AppShell>
  );
}
