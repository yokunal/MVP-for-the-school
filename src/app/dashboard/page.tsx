import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AccessPolicy } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { LIBRARY_LABELS } from "@/types";
import { NavBar } from "@/components/nav-bar";
import { BookCover } from "@/components/book-cover";
import { getSignedDownloadUrl } from "@/lib/r2";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const accessible = AccessPolicy.accessibleLibraries(user.role, user.classGrade);

  const [bookCountsByLibrary, recent, inProgress] = await Promise.all([
    prisma.book.groupBy({
      by: ["library"],
      where: { library: { in: accessible }, deletedAt: null },
      _count: true,
    }),
    prisma.book.findMany({
      where: { library: { in: accessible }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        author: true,
        subject: true,
        coverImageKey: true,
      },
    }),
    prisma.readingProgress.findMany({
      where: {
        userId: user.id,
        book: { library: { in: accessible } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        book: {
          select: { id: true, title: true, author: true, coverImageKey: true },
        },
      },
    }),
  ]);

  // Pre-resolve cover URLs server-side.
  const recentItems = await Promise.all(
    recent.map(async (b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      coverSrc: b.coverImageKey ? await getSignedDownloadUrl(b.coverImageKey) : "",
    }))
  );
  const inProgressItems = await Promise.all(
    inProgress.map(async (p) => ({
      id: p.bookId,
      title: p.book.title,
      author: p.book.author,
      updatedAt: p.updatedAt,
      coverSrc: p.book.coverImageKey
        ? await getSignedDownloadUrl(p.book.coverImageKey)
        : "",
    }))
  );

  const countMap = new Map<string, number>();
  for (const row of bookCountsByLibrary) countMap.set(row.library, row._count);

  return (
    <>
      <NavBar />
      <main className="container space-y-10 py-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {user.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "STUDENT"
              ? `You're in Class ${user.classGrade}. You can read books in the General library and your class library.`
              : "You can read books in any library, including all class libraries."}
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-lg font-medium">Your libraries</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {accessible.map((lib) => (
              <Link
                key={lib}
                href={`/libraries/${lib}`}
                className="group rounded-lg border bg-card p-5 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="secondary">{countMap.get(lib) ?? 0}</Badge>
                </div>
                <p className="mt-3 font-medium group-hover:underline">
                  {LIBRARY_LABELS[lib]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {countMap.get(lib) ?? 0} book{(countMap.get(lib) ?? 0) === 1 ? "" : "s"}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {inProgressItems.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-medium">Continue reading</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inProgressItems.map((p) => (
                <Link
                  key={p.id}
                  href={`/books/${p.id}/read`}
                  className="flex gap-3 rounded-lg border bg-card p-3 transition hover:bg-accent"
                >
                  <div className="w-16 shrink-0">
                    <BookCover src={p.coverSrc || null} alt={`Cover of ${p.title}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">{p.title}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {p.author}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground/80">
                      Last opened {new Date(p.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {recentItems.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-medium">Recently added</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {recentItems.map((b) => (
                <Link key={b.id} href={`/books/${b.id}`} className="space-y-2">
                  <div className="overflow-hidden rounded-lg border bg-card shadow-sm transition hover:shadow-md">
                    <BookCover src={b.coverSrc || null} alt={`Cover of ${b.title}`} />
                  </div>
                  <div>
                    <p className="line-clamp-1 text-sm font-medium">{b.title}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {b.author}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {recentItems.length === 0 && inProgressItems.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Nothing here yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The admin hasn&apos;t added any books to your libraries yet. Check
              back later, or ask the admin to upload one.
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
