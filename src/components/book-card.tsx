import Link from "next/link";
import { BookCover } from "@/components/book-cover";

export type BookCardData = {
  id: string;
  title: string;
  author: string;
  subject: string;
  hasCover: boolean;
  /** Pre-resolved signed/local cover URL — empty string if no cover. */
  coverSrc: string;
};

export function BookCard({ book }: { book: BookCardData }): React.ReactElement {
  return (
    <Link
      href={`/books/${book.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BookCover
        src={book.coverSrc || null}
        alt={`Cover of ${book.title}`}
        className="border-b"
      />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight group-hover:underline">
          {book.title}
        </h3>
        <p className="line-clamp-1 text-xs text-muted-foreground">{book.author}</p>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/80">
          {book.subject}
        </p>
      </div>
    </Link>
  );
}
