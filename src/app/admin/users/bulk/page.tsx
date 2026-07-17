import { CsvImport } from "@/components/admin/csv-import";

export default function BulkImportPage(): React.ReactElement {
  return (
    <main className="container max-w-4xl space-y-6 py-8">
      <div>
        <a
          href="/admin/users"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Users
        </a>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Bulk import users
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV. We&apos;ll validate the rows, show a preview, and only
          then commit. After committing, download a credentials sheet for the
          new users.
        </p>
      </div>
      <CsvImport />
    </main>
  );
}
