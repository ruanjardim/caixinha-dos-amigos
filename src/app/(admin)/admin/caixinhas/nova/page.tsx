import { redirect } from "next/navigation";

export const metadata = { title: "Nova caixinha" };

export default async function NewCaixinhaPage() {
  redirect("/caixinhas/nova");
}

