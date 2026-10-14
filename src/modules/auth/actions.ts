"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAudit } from "@/modules/audit/audit";
import { auth } from "@/modules/auth/auth";
import { getCurrentUser } from "@/modules/auth/session";

export async function signOutAction() {
  const user = await getCurrentUser();
  await auth.api.signOut({ headers: await headers() });
  if (user) {
    await recordAudit({ actorId: user.userId, action: "auth.logout", entityType: "User", entityId: user.userId });
  }
  redirect("/login");
}
