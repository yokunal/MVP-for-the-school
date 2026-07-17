import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { CsvUserParser } from "@/lib/csv";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/users/bulk-preview
 *
 * Body: { csv: string }
 *
 * Parses the CSV and returns a preview: per-row validation result + a
 * duplicate-against-DB check (so the admin can see which emails are taken).
 *
 * Nothing is written to the DB; the client must call /bulk-commit with the
 * approved rows.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let csv = "";
  try {
    const body = (await req.json()) as { csv?: string };
    csv = body.csv ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!csv.trim()) {
    return NextResponse.json({ error: "csv is empty" }, { status: 400 });
  }

  const preview = CsvUserParser.parse(csv);

  // Cross-check email collisions with the DB.
  const validEmails = preview
    .filter((r) => r.status === "ok")
    .map((r) => r.email);
  let dbExisting = new Set<string>();
  if (validEmails.length) {
    const found = await prisma.user.findMany({
      where: { email: { in: validEmails } },
      select: { email: true },
    });
    dbExisting = new Set(found.map((u) => u.email));
  }
  for (const r of preview) {
    if (r.status === "ok" && dbExisting.has(r.email)) {
      r.status = "error";
      r.errors.push("email already exists in database");
    }
  }

  const stats = preview.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      acc.total += 1;
      return acc;
    },
    { ok: 0, error: 0, total: 0 }
  );

  return NextResponse.json({ rows: preview, stats });
}
