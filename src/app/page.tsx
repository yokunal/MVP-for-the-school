import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function HomePage(): Promise<never> {
  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}
