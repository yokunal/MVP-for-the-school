import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  USER_CREATED: "User created",
  USER_BULK_IMPORTED: "Bulk import",
  PASSWORD_RESET: "Password reset",
  ROLE_CHANGED: "Role changed",
  USER_DEACTIVATED: "User deactivated",
  USER_REACTIVATED: "User reactivated",
  BOOK_DELETED: "Book deleted",
};

const ACTION_COLORS: Record<string, string> = {
  USER_CREATED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  USER_BULK_IMPORTED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  PASSWORD_RESET: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ROLE_CHANGED: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  USER_DEACTIVATED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  USER_REACTIVATED: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  BOOK_DELETED: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { page?: string; action?: string };
}): Promise<React.ReactElement> {
  await requireAdmin();

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const actionFilter = searchParams.action?.trim();

  const where = actionFilter && ACTION_LABELS[actionFilter]
    ? { action: actionFilter }
    : {};

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Resolve actor names and target names from User/Book tables.
  const userIds = new Set<string>();
  const bookIds = new Set<string>();
  for (const e of entries) {
    if (e.actorId) userIds.add(e.actorId);
    if (e.targetUserId) userIds.add(e.targetUserId);
    if (e.targetBookId) bookIds.add(e.targetBookId);
  }
  const [users, books] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true },
    }),
    prisma.book.findMany({
      where: { id: { in: [...bookIds] } },
      select: { id: true, title: true },
    }),
  ]);
  const userNameMap = new Map(users.map((u) => [u.id, u.name]));
  const bookTitleMap = new Map(books.map((b) => [b.id, b.title]));

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="container space-y-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>

      <form className="flex items-center gap-2" method="get">
        <select
          name="action"
          defaultValue={actionFilter ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" type="submit">
          Filter
        </Button>
        {actionFilter && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/audit-log">Clear</Link>
          </Button>
        )}
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No audit entries match.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {e.createdAt.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{userNameMap.get(e.actorId) ?? e.actorEmail}</div>
                      {userNameMap.has(e.actorId) && (
                        <div className="text-muted-foreground">{e.actorEmail}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          ACTION_COLORS[e.action] ??
                          "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                        }
                      >
                        {ACTION_LABELS[e.action] ?? e.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.targetUserId ? (userNameMap.get(e.targetUserId) ?? `${e.targetUserId.slice(0, 8)}…`) : ""}
                      {e.targetUserId && e.targetBookId ? ", " : ""}
                      {e.targetBookId ? (bookTitleMap.get(e.targetBookId) ?? `${e.targetBookId.slice(0, 8)}…`) : ""}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {e.metadata ?? ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={page <= 1}
          >
            <Link
              href={{
                pathname: "/admin/audit-log",
                query: {
                  ...(actionFilter ? { action: actionFilter } : {}),
                  page: String(page - 1),
                },
              }}
            >
              Previous
            </Link>
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
          >
            <Link
              href={{
                pathname: "/admin/audit-log",
                query: {
                  ...(actionFilter ? { action: actionFilter } : {}),
                  page: String(page + 1),
                },
              }}
            >
              Next
            </Link>
          </Button>
        </div>
      )}
    </main>
  );
}
