import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ALL_LIBRARIES, LIBRARY_LABELS } from "@/types";
import { Plus, Upload, Users } from "lucide-react";

type ErrorMeta = { kind?: string; error?: string };

export default async function AdminHomePage(): Promise<React.ReactElement> {
  const [bookCount, userCount, byLibrary, recentUsers] = await Promise.all([
    prisma.book.count({ where: { deletedAt: null } }),
    prisma.user.count(),
    prisma.book.groupBy({
      by: ["library"],
      where: { deletedAt: null },
      _count: true,
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, role: true, classGrade: true, createdAt: true },
    }),
  ]);

  // Recent render errors (signed URL expiry, PDF parse failures, etc.)
  const recentErrors = await prisma.auditLog.findMany({
    where: { action: "BOOK_ERROR" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, createdAt: true, targetBookId: true, metadata: true },
  });

  const libMap = new Map(byLibrary.map((r) => [r.library, r._count]));

  return (
    <main className="container space-y-8 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Upload books, manage users, and reset passwords.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/admin/books/new">
              <Upload className="h-4 w-4" /> Upload book
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/users">
              <Users className="h-4 w-4" /> Manage users
            </Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Books
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{bookCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{userCount}</p>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Books by library</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ALL_LIBRARIES.map((lib) => (
            <Link
              key={lib}
              href={`/libraries/${lib}`}
              className="rounded-lg border bg-card p-4 hover:shadow-sm"
            >
              <p className="text-sm font-medium">{LIBRARY_LABELS[lib]}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {libMap.get(lib) ?? 0}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Render error alert — surfaced when signed URLs expire or PDFs fail */}
      {recentErrors.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Reader errors</h2>
          <Card className="border-amber-200 dark:border-amber-800/30">
            <CardContent className="p-4">
              <p className="mb-2 text-sm text-amber-700 dark:text-amber-400">
                {recentErrors.length} recent reader error{recentErrors.length === 1 ? "" : "s"} — may indicate expired links or file issues.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {recentErrors.map((e) => {
                  let meta: { kind?: string; error?: string } | null = null;
                  if (e.metadata) { try { meta = JSON.parse(e.metadata); } catch { /* ignore */ } }
                  return (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {new Date(e.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">
                        {meta?.kind ?? "book"} error
                      </span>
                      <span className="truncate">
                        {meta?.error ?? "unknown"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/audit-log">View audit log</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Newest users</h2>
        <Card>
          <CardContent className="p-0">
            {recentUsers.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No users created yet.
              </p>
            ) : (
              <ul className="divide-y">
                {recentUsers.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-medium">{u.role}</p>
                      {u.classGrade != null && (
                        <p className="text-muted-foreground">Class {u.classGrade}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <div className="mt-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/users">
              <Plus className="h-4 w-4" /> Add another user
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
