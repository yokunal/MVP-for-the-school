import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME;

  // If any of the three is missing, skip silently — first deploy may run before
  // the operator has filled these in. They can be set in Railway's Variables tab
  // and the next deploy will pick them up.
  if (!email || !password || !name) {
    console.log(
      "[seed] SEED_ADMIN_EMAIL/PASSWORD/NAME not all set — skipping admin bootstrap."
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Admin '${email}' already exists — skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
    },
  });

  console.log(`[seed] Created admin '${admin.email}' (id=${admin.id}).`);
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
