import { notFound, redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AccessPolicy } from "@/lib/access";
import { PdfReader } from "@/components/pdf-reader";

// epub.js touches the DOM directly — load it on the client only.
const EpubReader = dynamic(
  () => import("@/components/epub-reader").then((m) => m.EpubReader),
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

  if (book.pdfKey) {
    const url = await getSignedDownloadUrl(book.pdfKey);
    const initialPage = progress?.lastLocation
      ? Math.max(1, parseInt(progress.lastLocation, 10) || 1)
      : 1;
    return (
      <main className="flex h-screen flex-col">
        <PdfReader
          bookId={book.id}
          url={url}
          title={book.title}
          initialPage={initialPage}
        />
      </main>
    );
  }
  if (book.epubKey) {
    const url = await getSignedDownloadUrl(book.epubKey);
    const initialCfi = progress?.lastLocation ?? null;
    return (
      <main className="flex h-screen flex-col">
        <EpubReader bookId={book.id} url={url} initialCfi={initialCfi} />
      </main>
    );
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <div>
        This book doesn't have a readable file uploaded yet.
        <div className="mt-4">
          <a className="text-primary hover:underline" href={`/books/${book.id}`}>
            Back to book
          </a>
        </div>
      </div>
    </main>
  );
}
