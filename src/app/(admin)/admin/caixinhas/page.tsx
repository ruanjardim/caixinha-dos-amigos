import { redirect } from "next/navigation";

export const metadata = { title: "Minhas caixinhas" };

export default async function CaixinhasPage() {
  redirect("/caixinhas");
}

