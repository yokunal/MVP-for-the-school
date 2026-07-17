import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UsersTable, type UserRow } from "@/components/admin/users-table";
import { AddUserForm } from "@/components/admin/add-user-form";
import { Upload } from "lucide-react";

export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams: { q?: string };
}): Promise<React.ReactElement> {
  const admin = await requireAdmin();
  const q = (searchParams.q ?? "").trim();

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    classGrade: u.classGrade,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <main className="container space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <Button asChild variant="outline">
          <Link href="/admin/users/bulk">
            <Upload className="h-4 w-4" /> Bulk import (CSV)
          </Link>
        </Button>
      </div>

      <AddUserForm />

      <form className="flex items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          className="h-10 w-72 rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button variant="outline" size="sm" type="submit">
          Search
        </Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <UsersTable users={rows} currentUserId={admin.id} />
        </CardContent>
      </Card>
    </main>
  );
}
