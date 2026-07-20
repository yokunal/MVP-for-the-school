import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AccessPolicy } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  LibraryBookFilter,
  type LibraryBookFilterProps,
} from "@/components/book-grid";
import { LIBRARY_LABELS, type Library as LibraryEnum } from "@/types";
import { NavBar } from "@/components/nav-bar";
import { isLibraryEnum } from "@/lib/csv";
import { Card } from "@/components/ui/card";
import { getSignedDownloadUrl } from "@/lib/r2";

type Params = { library: string };

export default async function LibraryPage({
  params,
}: {
  params: Params;
}): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isLibraryEnum(params.library)) notFound();
  const library = params.library as LibraryEnum;

  if (!AccessPolicy.canReadBook(user.role, user.classGrade, library)) {
    redirect("/dashboard");
  }

  const books = await prisma.book.findMany({
    where: { library, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      author: true,
      subject: true,
      coverImageKey: true,
    },
  });

  const items = await Promise.all(
    books.map(async (b): Promise<LibraryBookFilterProps["books"][number]> => ({
      id: b.id,
      title: b.title,
      author: b.author,
      subject: b.subject,
      hasCover: Boolean(b.coverImageKey),
      coverSrc: b.coverImageKey ? await getSignedDownloadUrl(b.coverImageKey) : "",
    }))
  );

  const subjects = Array.from(new Set(items.map((b) => b.subject))).sort();
  const authors = Array.from(new Set(items.map((b) => b.author))).sort();

  return (
    <>
      <NavBar />
      <main className="container py-8">
        <div className="mb-6">
          <a
            href="/dashboard"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Dashboard
          </a>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {LIBRARY_LABELS[library]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {items.length} book{items.length === 1 ? "" : "s"}
          </p>
        </div>

        {items.length === 0 ? (
          <Card className="border-dashed p-12 text-center text-sm text-muted-foreground">
            No books have been added to this library yet.
          </Card>
        ) : (
          <LibraryBookFilter books={items} subjects={subjects} authors={authors} />
        )}
      </main>
    </>
  );
}
