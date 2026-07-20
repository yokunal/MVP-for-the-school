import { prisma } from "@/lib/db";

/**
 * Canonical audit actions. Stored as strings in the DB (SQLite-compatible).
 */
export const AuditAction = {
  USER_CREATED: "USER_CREATED",
  USER_BULK_IMPORTED: "USER_BULK_IMPORTED",
  PASSWORD_RESET: "PASSWORD_RESET",
  ROLE_CHANGED: "ROLE_CHANGED",
  USER_DEACTIVATED: "USER_DEACTIVATED",
  USER_REACTIVATED: "USER_REACTIVATED",
  BOOK_DELETED: "BOOK_DELETED",
  BOOK_ERROR: "BOOK_ERROR",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Write an entry to the audit log.
 *
 * Call from any API route after performing the auditable action.
 *
 * Examples:
 *   AuditLog.write("admin@school", "USER_CREATED", { targetUserId: "xxx", metadata: { role: "STUDENT" } });
 */
export class AuditLog {
  static async write(
    actorId: string,
    actorEmail: string,
    action: AuditAction,
    opts?: {
      targetUserId?: string;
      targetBookId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actorId,
          actorEmail,
          action,
          targetUserId: opts?.targetUserId ?? null,
          targetBookId: opts?.targetBookId ?? null,
          metadata: opts?.metadata ? JSON.stringify(opts.metadata) : null,
        },
      });
    } catch (err) {
      // Audit logging must never break the main operation. Log and swallow.
      console.error("[audit] Failed to write entry:", err);
    }
  }
}
