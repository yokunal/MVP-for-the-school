import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { CsvUserParser } from "@/lib/csv";
import { AuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
  classGrade: z
    .number()
    .int()
    .min(6)
    .max(12)
    .nullable()
    .optional(),
  password: z.string().min(6).max(128).optional(),
});

/**
 * POST /api/admin/users — create a single user.
 * Returns: { id, tempPassword } where tempPassword is the auto-generated
 * one if no password was provided. The admin should hand this to the user.
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

  let { name, email, role } = parsed.data;
  let classGrade = parsed.data.classGrade ?? null;
  let password = parsed.data.password;
  if (!password) {
    password = CsvUserParser.generateTempPassword();
  }

  if (role === "STUDENT" && classGrade == null) {
    return NextResponse.json(
      { error: "class is required for students (6–12)" },
      { status: 400 }
    );
  }
  if (role !== "STUDENT") classGrade = null;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: `A user with email ${email} already exists.` },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      role,
      classGrade,
      passwordHash,
      isActive: true,
    },
    select: { id: true, email: true, name: true, role: true, classGrade: true },
  });

  AuditLog.write(user.id, user.email, "USER_CREATED", {
    targetUserId: created.id,
    metadata: { name, role, classGrade },
  });

  return NextResponse.json({ user: created, tempPassword: password });
}
