import { NextResponse } from "next/server";
import { envHasDatabase, envHasR2, getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { checkR2Health } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HealthResponse = {
  status: "ok" | "degraded";
  db: string;
  r2: string;
  env: { hasDatabaseUrl: boolean; hasR2: boolean };
  timestamp: string;
};

/**
 * Health endpoint used by Railway's healthcheck and by the Step 1 landing
 * page. Returns 200 only if both Postgres and R2 are reachable; otherwise 503
 * so a broken deploy is detected quickly.
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  const env = getServerEnv();
  const hasDatabaseUrl = envHasDatabase();
  const hasR2 = envHasR2();

  let dbStatus = "skipped: DATABASE_URL not set";
  let r2Status = "skipped: R2 vars not set";

  if (hasDatabaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = "ok";
    } catch (err) {
      dbStatus = `error: ${(err as Error).message}`;
    }
  }

  if (hasR2) {
    try {
      const ok = await checkR2Health();
      r2Status = ok ? "ok" : "error: HeadBucket failed";
    } catch (err) {
      r2Status = `error: ${(err as Error).message}`;
    }
  }

  const allOk =
    dbStatus === "ok" && r2Status === "ok" && hasDatabaseUrl && hasR2;

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      db: dbStatus,
      r2: r2Status,
      env: { hasDatabaseUrl, hasR2 },
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}
