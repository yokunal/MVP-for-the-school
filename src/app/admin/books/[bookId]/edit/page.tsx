import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BookForm } from "@/components/admin/book-form";
import type { Library } from "@/types";

export default async function EditBookPage({
  params,
}: {
  params: { bookId: string };
}): Promise<React.ReactElement> {
  const book = await prisma.book.findUnique({
    where: { id: params.bookId },
  });
  if (!book) notFound();

  return (
    <main className="container max-w-3xl space-y-6 py-8">
      <div>
        <a href="/admin/books" className="text-xs text-muted-foreground hover:underline">
          ← Books
        </a>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Edit book</h1>
        <p className="text-sm text-muted-foreground">{book.title}</p>
      </div>
      <BookForm
        mode="edit"
        initial={{
          id: book.id,
          title: book.title,
          author: book.author,
          subject: book.subject,
          synopsis: book.synopsis,
          library: book.library as Library,
          hasPdf: Boolean(book.pdfKey),
          hasEpub: Boolean(book.epubKey),
          hasCover: Boolean(book.coverImageKey),
        }}
      />
    </main>
  );
}
