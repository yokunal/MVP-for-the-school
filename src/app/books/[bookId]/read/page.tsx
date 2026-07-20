import { notFound, redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AccessPolicy } from "@/lib/access";

const ReaderWithRefresh = dynamic(
  () =>
    import("@/components/reader-with-refresh").then((m) => m.ReaderWithRefresh),
  { ssr: false }
);

type Params = { bookId: string };

export default async function ReadBookPage({
  params,
}: {
  params: Params;
}): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const book = await prisma.book.findFirst({
    where: { id: params.bookId, deletedAt: null },
    select: {
      id: true,
      title: true,
      library: true,
      pdfKey: true,
      epubKey: true,
    },
  });
  if (!book) notFound();
  if (!AccessPolicy.canReadBook(user.role, user.classGrade, book.library)) {
    redirect("/dashboard");
  }

  const progress = await prisma.readingProgress.findUnique({
    where: { userId_bookId: { userId: user.id, bookId: book.id } },
    select: { lastLocation: true },
  });

  const { getSignedDownloadUrl } = await import("@/lib/r2");

  let kind: "pdf" | "epub";
  let url: string;
  let initialPage = 1;
  let initialCfi: string | null = null;

  if (book.pdfKey) {
    kind = "pdf";
    url = await getSignedDownloadUrl(book.pdfKey);
    initialPage = progress?.lastLocation
      ? Math.max(1, parseInt(progress.lastLocation, 10) || 1)
      : 1;
  } else if (book.epubKey) {
    kind = "epub";
    url = await getSignedDownloadUrl(book.epubKey);
    initialCfi = progress?.lastLocation ?? null;
  } else {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center text-sm text-muted-foreground">
        <div>
          This book doesn&apos;t have a readable file uploaded yet.
          <div className="mt-4">
            <a className="text-primary hover:underline" href={`/books/${book.id}`}>
              Back to book
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <ReaderWithRefresh
        bookId={book.id}
        title={book.title}
        kind={kind}
        initialPage={initialPage}
        initialCfi={initialCfi}
        serverUrl={url}
      />
    </main>
  );
}
