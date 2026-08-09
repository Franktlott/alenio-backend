import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime safety net for workspace trial and industry columns. */
export async function ensureWorkspaceTrialSchema(prisma: PrismaClient): Promise<void> {
  const statements = [
    `ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "industry" TEXT`,
    `ALTER TABLE "TeamSubscription" ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP(3)`,
    `ALTER TABLE "TeamSubscription" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3)`,
    `ALTER TABLE "TeamSubscription" ALTER COLUMN "plan" DROP DEFAULT`,
    `ALTER TABLE "TeamSubscription" ALTER COLUMN "status" DROP DEFAULT`,
  ];
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
