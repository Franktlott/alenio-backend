import type { PrismaClient } from "@prisma/client";

/** Additive rollout for the account-level Get Started completion marker. */
export async function ensureGetStartedSchema(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "getStartedCompletedAt" TIMESTAMP(3);
  `);
}
