import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, GraduationCap, ShieldCheck, Users } from "lucide-react";

const roles = [
  {
    href: "/login/student",
    label: "Student",
    description: "I am a student",
    icon: GraduationCap,
  },
  {
    href: "/login/teacher",
    label: "Teacher",
    description: "I am a teacher",
    icon: Users,
  },
  {
    href: "/login/admin",
    label: "Admin",
    description: "I am an administrator",
    icon: ShieldCheck,
  },
] as const;

export default async function LoginChooserPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const cb = searchParams.callbackUrl
    ? `?callbackUrl=${encodeURIComponent(searchParams.callbackUrl)}`
    : "";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <BookOpen className="h-5 w-5" />
            <span>School Library</span>
          </div>
          <CardTitle>Who are you?</CardTitle>
          <CardDescription>
            Choose your role to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {roles.map(({ href, label, description, icon: Icon }) => (
            <Button
              key={label}
              variant="outline"
              className="flex w-full items-center gap-3 h-auto py-4 px-4"
              asChild
            >
              <Link href={`${href}${cb}`}>
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {description}
                  </span>
                </span>
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
