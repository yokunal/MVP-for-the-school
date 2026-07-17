import { requireAdmin } from "@/lib/session";
import { AdminHeader } from "@/components/admin/admin-header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  await requireAdmin();
  return (
    <div className="min-h-screen">
      <AdminHeader />
      {children}
    </div>
  );
}
