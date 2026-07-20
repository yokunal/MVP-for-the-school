/**
 * In-memory rate limiter for login attempts.
 *
 * Tracks failed attempts per email+IP combo. Designed so the backing store
 * can be swapped for Redis with minimal changes — implement the same
 * `RateLimitStore` interface and swap the instance.
 *
 * Usage:
 *   const limiter = new LoginRateLimiter();
 *   // On failed login:
 *   limiter.recordFailure("a@b.com", "127.0.0.1");
 *   // Before authorizing:
 *   const result = limiter.check("a@b.com", "127.0.0.1");
 *   if (result.blocked) return null; // "too many attempts"
 */

export type RateLimitResult =
  | { blocked: false; remaining: number }
  | { blocked: true; remaining: 0; resetAt: Date };

export interface RateLimitStore {
  recordFailure(key: string): void;
  check(key: string): RateLimitResult;
  /** Remove expired entries (called periodically). */
  cleanup(): void;
}

// -----------------------------------------------------------------------
// In-memory implementation
// -----------------------------------------------------------------------

type AttemptEntry = {
  timestamps: number[]; // ms timestamps of failed attempts
};

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly store = new Map<string, AttemptEntry>();

  constructor(maxAttempts = 5, windowMinutes = 15) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMinutes * 60 * 1000;
  }

  recordFailure(key: string): void {
    const now = Date.now();
    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }
    // Remove timestamps outside the window before adding new one.
    entry.timestamps = entry.timestamps.filter((t) => now - t < this.windowMs);
    entry.timestamps.push(now);
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry) {
      return { blocked: false, remaining: this.maxAttempts };
    }
    // Count timestamps still within the window — do NOT mutate store here.
    // Mutation only happens in recordFailure() and cleanup(), so that
    // calling check() alone never grants extra attempts.
    const recent = entry.timestamps.filter((t) => now - t < this.windowMs);
    if (recent.length >= this.maxAttempts) {
      const resetAt = new Date(Math.min(...recent) + this.windowMs);
      return { blocked: true, remaining: 0, resetAt };
    }
    return { blocked: false, remaining: this.maxAttempts - recent.length };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < this.windowMs);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

// -----------------------------------------------------------------------
// Singleton — shared across all consumers in the same Node process.
//
// In-memory only — does NOT work across multiple instances. Current Railway
// deployment runs a single Node process, so this is correct. If scaling to
// multiple instances in the future, swap InMemoryRateLimitStore for a Redis-
// backed implementation sharing the same RateLimitStore interface.
// -----------------------------------------------------------------------

export const loginRateLimiter = new InMemoryRateLimitStore(5, 15);

/**
 * Secondary IP-wide rate limiter for shared-network scenarios.
 *
 * The primary limiter keys on `email:ip`, so each user behind a shared IP
 * has their own 5-attempt budget. This secondary limiter keys on IP alone
 * with a much higher threshold, preventing brute-force across many accounts
 * from a single IP while avoiding false positives in a classroom setting.
 *
 * Threshold: 20 failed attempts per 15 min per IP.
 */
export const ipWideRateLimiter = new InMemoryRateLimitStore(20, 15);

/** Stricter rate limiter for change-password: 3 attempts per 5 min per user+IP. */
export const changePasswordRateLimiter = new InMemoryRateLimitStore(3, 5);

// Clean up expired entries every 5 minutes.
setInterval(() => {
  loginRateLimiter.cleanup();
  ipWideRateLimiter.cleanup();
  changePasswordRateLimiter.cleanup();
}, 5 * 60 * 1000).unref();

// -----------------------------------------------------------------------
// Helper to extract client IP from a Next.js request-like object.
//
// Trusts x-forwarded-for — safe because Railway is the only ingress proxy.
// If deploying behind a configurable proxy (e.g. Cloudflare, nginx), verify
// that it sets x-forwarded-for reliably before trusting it.
// -----------------------------------------------------------------------

export function extractIp(
  headers?: Record<string, string | string[] | undefined>
): string {
  const forwarded = headers?.["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0].trim();
  }
  return headers?.["x-real-ip"] as string ?? "unknown";
}
