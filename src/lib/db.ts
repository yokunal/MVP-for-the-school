import { PrismaClient } from "@prisma/client";

// HMR-safe Prisma singleton. Without this, every Next.js dev reload would
// spin up a new PrismaClient and exhaust the DB connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
