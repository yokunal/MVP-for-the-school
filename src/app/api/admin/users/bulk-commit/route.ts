import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { CsvUserParser, type CsvPreviewRow } from "@/lib/csv";
import { AuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  rows: z.array(z.any()).max(2000),
});

/**
 * POST /api/admin/users/bulk-commit
 *
 * Body: { rows: CsvPreviewRow[] }
 *
 * Re-validates each row server-side (the client preview is for display
 * only) and writes the users that pass. Returns the per-row outcome plus
 * the generated credentials so the admin can download them.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  type CommitResult = {
    row: number;
    email: string;
    status: "created" | "skipped" | "error";
    tempPassword?: string;
    name?: string;
    role?: string;
    classGrade?: number | null;
    error?: string;
  };

  const results: CommitResult[] = [];

  for (const row of parsed.data.rows as CsvPreviewRow[]) {
    if (row.status !== "ok") {
      results.push({
        row: row.row,
        email: row.email,
        status: "skipped",
        name: row.name,
        role: row.role,
        classGrade: row.classGrade,
        error: row.errors.join("; "),
      });
      continue;
    }
    try {
      const exists = await prisma.user.findUnique({
        where: { email: row.email },
        select: { id: true },
      });
      if (exists) {
        results.push({
          row: row.row,
          email: row.email,
          status: "error",
          error: "email already exists",
        });
        continue;
      }
      const tempPassword = CsvUserParser.generateTempPassword();
      const hash = await bcrypt.hash(tempPassword, 12);
      await prisma.user.create({
        data: {
          name: row.name,
          email: row.email,
          role: row.role,
          classGrade: row.classGrade,
          passwordHash: hash,
          isActive: true,
        },
      });
      results.push({
        row: row.row,
        email: row.email,
        name: row.name,
        role: row.role,
        classGrade: row.classGrade,
        status: "created",
        tempPassword,
      });
    } catch (e) {
      results.push({
        row: row.row,
        email: row.email,
        status: "error",
        error: (e as Error).message,
      });
    }
  }

  const summary = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  await AuditLog.write(user.id, user.email, "USER_BULK_IMPORTED", {
    metadata: { created: summary.created ?? 0, skipped: summary.skipped ?? 0, errors: summary.error ?? 0 },
  });

  return NextResponse.json({ results, summary });
}
