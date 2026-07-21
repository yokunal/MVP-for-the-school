import Link from "next/link";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ALL_LIBRARIES, LIBRARY_LABELS, type Library as LibEnum } from "@/types";
import { isLibraryEnum } from "@/lib/csv";
import { Plus, Pencil, Upload } from "lucide-react";
import { DeleteBookButton } from "@/components/admin/delete-book-button";

export default async function AdminBooksPage({
  searchParams,
}: {
  searchParams: { library?: string; q?: string };
}): Promise<React.ReactElement> {
  const filterLib =
    searchParams.library && isLibraryEnum(searchParams.library)
      ? (searchParams.library as LibEnum)
      : null;
  const q = (searchParams.q ?? "").trim();

  const books = await prisma.book.findMany({
    where: {
      deletedAt: null,
      ...(filterLib ? { library: filterLib } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { author: { contains: q } },
              { subject: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true, email: true } } },
  });

  return (
    <main className="container space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Books</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/books/bulk">
              <Upload className="h-4 w-4" /> Bulk upload
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/books/new">
              <Plus className="h-4 w-4" /> New book
            </Link>
          </Button>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title/author/subject"
          className="h-10 w-64 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select
          name="library"
          defaultValue={filterLib ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All libraries</option>
          {ALL_LIBRARIES.map((l) => (
            <option key={l} value={l}>
              {LIBRARY_LABELS[l]}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" type="submit">
          Filter
        </Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden sm:table-cell">Author</TableHead>
                <TableHead className="hidden md:table-cell">Subject</TableHead>
                <TableHead className="hidden md:table-cell">Library</TableHead>
                <TableHead className="hidden lg:table-cell">Formats</TableHead>
                <TableHead className="hidden lg:table-cell">Uploaded by</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {books.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No books match.
                  </TableCell>
                </TableRow>
              ) : (
                books.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.title}</TableCell>
                    <TableCell className="hidden sm:table-cell">{b.author}</TableCell>
                    <TableCell className="hidden md:table-cell">{b.subject}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">{LIBRARY_LABELS[b.library as LibEnum]}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex gap-1">
                        {b.pdfKey && <Badge>PDF</Badge>}
                        {b.epubKey && <Badge>EPUB</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {b.uploadedBy.name}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/admin/books/${b.id}/edit`}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Link>
                        </Button>
                        <DeleteBookButton bookId={b.id} bookTitle={b.title} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
