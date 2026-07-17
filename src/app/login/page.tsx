import { LoginForm } from "@/components/login-form";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function LoginPage(): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <LoginForm />
    </main>
  );
}
