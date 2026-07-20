/**
 * Lightweight in-memory egress tracker for signed URL downloads.
 *
 * Counts signed-URL requests per book+kind so monthly egress cost is
 * visible.  Uses a daily-rolling window — older entries are discarded
 * on the next write.
 *
 * This is an ESTIMATE, not a billing-grade meter.  Real cost depends
 * on actual bytes transferred, content negotiation (range requests),
 * and Cloudflare's billing granularity.
 */

export type EgressRecord = {
  bookId: string;
  kind: "pdf" | "epub" | "cover";
  count: number;
  estimatedBytes: number;
};

// Rough average file sizes for egress estimation
const AVG_BYTES: Record<string, number> = {
  pdf: 10_000_000,   // 10 MB
  epub: 2_000_000,   // 2 MB
  cover: 200_000,    // 200 KB
};

class EgressTracker {
  private _records = new Map<string, { count: number; day: string }>();
  private _totals = new Map<string, number>(); // day → total estimated bytes

  /** Register a signed-URL request for the given book+kind. */
  record(bookId: string, kind: "pdf" | "epub" | "cover"): void {
    const day = today();
    const key = `${day}:${bookId}:${kind}`;
    const existing = this._records.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      this._records.set(key, { count: 1, day });
    }

    const current = this._totals.get(day) ?? 0;
    this._totals.set(day, current + (AVG_BYTES[kind] ?? 1_000_000));

    // Prune records older than 7 days so the map doesn't grow unbounded
    this._prune(day);
  }

  /** Get egress stats for the current day (today's estimated bytes). */
  getDailyStats(): { totalEstimatedBytes: number; records: EgressRecord[] } {
    const day = today();
    const records: EgressRecord[] = [];

    for (const [key, val] of this._records) {
      const [, bookId, kind] = key.split(":");
      if (val.day === day && (kind === "pdf" || kind === "epub" || kind === "cover")) {
        records.push({
          bookId,
          kind,
          count: val.count,
          estimatedBytes: val.count * (AVG_BYTES[kind] ?? 1_000_000),
        });
      }
    }

    return {
      totalEstimatedBytes: this._totals.get(day) ?? 0,
      records,
    };
  }

  /** Get estimated bytes for the last N days combined. */
  getEstimatedEgress(days = 30): number {
    let total = 0;
    for (const [entryDay, bytes] of this._totals) {
      // Simple date comparison — keep entries within the window
      if (daysSince(entryDay) <= days) {
        total += bytes;
      }
    }
    return total;
  }

  /** Format bytes into a human-readable string. */
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /** Estimate monthly cost at the given per-GB rate. */
  estimateMonthlyCost(perGbCents = 9): number {
    const monthlyBytes = this.getEstimatedEgress(30);
    const gb = monthlyBytes / (1024 * 1024 * 1024);
    return Math.round(gb * perGbCents * 100) / 100; // cents
  }

  private _prune(todayStr: string): void {
    const cutoff = 7; // keep 7 days
    for (const [key] of this._records) {
      const day = key.split(":")[0];
      if (daysSince(day) > cutoff) {
        this._records.delete(key);
      }
    }
    for (const [day] of this._totals) {
      if (daysSince(day) > cutoff) {
        this._totals.delete(day);
      }
    }
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(dayStr: string): number {
  const then = new Date(dayStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/** Singleton tracker used across the app. */
export const egressTracker = new EgressTracker();
