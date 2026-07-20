import { z } from "zod";

// ---------------------------------------------------------------------------
// Environment validation. Runs once at boot, fails fast with a readable error
// if anything required is missing. Optional vars (NEXTAUTH_SECRET, ANTHROPIC_*
// in step 1) are only required when their consumers run.
// ---------------------------------------------------------------------------

const serverSchema = z.object({
  // Database — required
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // NextAuth — required. Validated at middleware import time via getServerEnv().
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url().optional(),

  // Cloudflare R2 — required
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET_NAME: z.string().min(1, "R2_BUCKET_NAME is required"),
  R2_ENDPOINT: z
    .string()
    .url("R2_ENDPOINT must be a valid URL (e.g. https://<account_id>.r2.cloudflarestorage.com)"),
  R2_SIGNED_URL_TTL_SECONDS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 300))
    .pipe(z.number().int().positive()),

  // Anthropic — used in step 7; optional in step 1
  ANTHROPIC_API_KEY: z.string().optional(),

  // Seed bootstrap admin — all-or-nothing (see prisma/seed.ts)
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_ADMIN_NAME: z.string().optional(),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Validated server env. Throws on the first call if any required var is missing
 * or malformed. Subsequent calls return the cached object.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nSee .env.example for the full list.`
    );
  }
  cached = parsed.data;
  return cached;
}

/**
 * For routes that only need to know whether the optional vars are present
 * (e.g. the health endpoint). Does NOT throw if anything is missing.
 */
export function envHasR2(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_ENDPOINT
  );
}

export function envHasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
