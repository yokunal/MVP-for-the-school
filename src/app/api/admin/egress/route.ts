import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { egressTracker } from "@/lib/egress-tracker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/egress
 *
 * Returns estimated egress stats from the in-memory tracker.
 * Admin only. For monitoring cost exposure, not billing.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const daily = egressTracker.getDailyStats();
  const monthlyBytes = egressTracker.getEstimatedEgress(30);
  const estimatedMonthlyCost = egressTracker.estimateMonthlyCost(9); // $0.09/GB

  return NextResponse.json({
    today: {
      estimatedBytes: daily.totalEstimatedBytes,
      display: egressTracker.formatBytes(daily.totalEstimatedBytes),
      requests: daily.records.length,
    },
    estimated30Day: {
      bytes: monthlyBytes,
      display: egressTracker.formatBytes(monthlyBytes),
      estimatedCostUsd: estimatedMonthlyCost,
    },
    records: daily.records,
  });
}
