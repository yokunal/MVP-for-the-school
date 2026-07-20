import { BulkBookUpload } from "@/components/admin/bulk-book-upload";

export const dynamic = "force-dynamic";

export default function BulkUploadPage(): React.ReactElement {
  return (
    <main className="container space-y-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Bulk upload books</h1>
      <BulkBookUpload />
    </main>
  );
}
