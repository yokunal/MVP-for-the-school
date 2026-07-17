import { BookForm } from "@/components/admin/book-form";

export default function NewBookPage(): React.ReactElement {
  return (
    <main className="container max-w-3xl space-y-6 py-8">
      <div>
        <a href="/admin/books" className="text-xs text-muted-foreground hover:underline">
          ← Books
        </a>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Upload a new book</h1>
        <p className="text-sm text-muted-foreground">
          Pick a library, upload the file, fill in the details, and you're done.
        </p>
      </div>
      <BookForm mode="create" />
    </main>
  );
}
