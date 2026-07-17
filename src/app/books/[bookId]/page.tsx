import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AccessPolicy } from "@/lib/access";
import { NavBar } from "@/components/nav-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookChat } from "@/components/book-chat";
import { LIBRARY_LABELS } from "@/types";
import { BookOpen, FileText, Book as BookIcon } from "lucide-react";

export default async function BookDetailPage({
  params,
}: {
  params: { bookId: string };
}): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const book = await prisma.book.findUnique({
    where: { id: params.bookId },
  });
  if (!book) notFound();
  if (!AccessPolicy.canReadBook(user.role, user.classGrade, book.library)) {
    redirect("/dashboard");
  }

  const hasPdf = Boolean(book.pdfKey);
  const hasEpub = Boolean(book.epubKey);

  let coverUrl: string | null = null;
  if (book.coverImageKey) {
    const { getSignedDownloadUrl } = await import("@/lib/r2");
    coverUrl = await getSignedDownloadUrl(book.coverImageKey);
  }

  return (
    <>
      <NavBar />
      <main className="container py-8">
        <a
          href={`/libraries/${book.library}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {LIBRARY_LABELS[book.library]}
        </a>

        <div className="mt-4 grid gap-8 md:grid-cols-[260px_1fr]">
          <div className="space-y-4">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt={`Cover of ${book.title}`}
                className="aspect-[2/3] w-full rounded-lg border object-cover shadow-sm"
              />
            ) : (
              <div className="flex aspect-[2/3] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                No cover
              </div>
            )}
            {(hasPdf || hasEpub) && (
              <Button asChild className="w-full" size="lg">
                <Link href={`/books/${book.id}/read`}>
                  <BookOpen className="h-4 w-4" /> Read now
                </Link>
              </Button>
            )}
            {!hasPdf && !hasEpub && (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  This book doesn't have a readable file uploaded yet. Ask the
                  admin to add one.
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <header>
              <h1 className="text-2xl font-semibold tracking-tight">
                {book.title}
              </h1>
              <p className="text-muted-foreground">by {book.author}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{book.subject}</Badge>
                <Badge variant="outline">{LIBRARY_LABELS[book.library]}</Badge>
                {hasPdf && (
                  <Badge variant="outline" className="gap-1">
                    <FileText className="h-3 w-3" /> PDF
                  </Badge>
                )}
                {hasEpub && (
                  <Badge variant="outline" className="gap-1">
                    <BookIcon className="h-3 w-3" /> EPUB
                  </Badge>
                )}
              </div>
            </header>

            <Card>
              <CardContent className="p-6">
                <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Synopsis
                </h2>
                <p className="whitespace-pre-line text-sm leading-relaxed">
                  {book.synopsis}
                </p>
              </CardContent>
            </Card>

            <BookChat bookId={book.id} />
          </div>
        </div>
      </main>
    </>
  );
}
