import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/modules/auth/session";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user && user.status === "ACTIVE" ? homePathFor(user) : "/login");
}
