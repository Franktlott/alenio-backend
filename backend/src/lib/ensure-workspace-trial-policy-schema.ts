import type { PrismaClient } from "@prisma/client";
import { syncWorkspaceTrialIdentity } from "./workspace-trial-policy";

/** Additive production fallback for the one-trial policy and paid workspace drafts. */
export async function ensureWorkspaceTrialPolicySchema(prisma: PrismaClient): Promise<void> {
  const statements = [
    `ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "workspaceTrialStartedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "workspaceTrialConsumedAt" TIMESTAMP(3)`,
    `CREATE TABLE IF NOT EXISTS "WorkspaceTrialIdentity" (
      "id" TEXT NOT NULL,
      "emailHash" TEXT NOT NULL,
      "userId" TEXT,
      "trialStartedAt" TIMESTAMP(3),
      "trialConsumedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WorkspaceTrialIdentity_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceTrialIdentity_emailHash_key"
      ON "WorkspaceTrialIdentity"("emailHash")`,
    `CREATE INDEX IF NOT EXISTS "WorkspaceTrialIdentity_userId_idx"
      ON "WorkspaceTrialIdentity"("userId")`,
    `CREATE TABLE IF NOT EXISTS "PendingWorkspaceCheckout" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "nameKey" TEXT,
      "industry" TEXT,
      "location" TEXT,
      "timezone" TEXT,
      "plan" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "stripeCheckoutSessionId" TEXT,
      "stripeSubscriptionId" TEXT,
      "teamId" TEXT,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "completedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PendingWorkspaceCheckout_pkey" PRIMARY KEY ("id")
    )`,
    `ALTER TABLE "PendingWorkspaceCheckout"
      ADD COLUMN IF NOT EXISTS "nameKey" TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PendingWorkspaceCheckout_stripeCheckoutSessionId_key"
      ON "PendingWorkspaceCheckout"("stripeCheckoutSessionId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PendingWorkspaceCheckout_nameKey_key"
      ON "PendingWorkspaceCheckout"("nameKey")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PendingWorkspaceCheckout_stripeSubscriptionId_key"
      ON "PendingWorkspaceCheckout"("stripeSubscriptionId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PendingWorkspaceCheckout_teamId_key"
      ON "PendingWorkspaceCheckout"("teamId")`,
    `CREATE INDEX IF NOT EXISTS "PendingWorkspaceCheckout_userId_createdAt_idx"
      ON "PendingWorkspaceCheckout"("userId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "PendingWorkspaceCheckout_status_expiresAt_idx"
      ON "PendingWorkspaceCheckout"("status", "expiresAt")`,
    `DO $$ BEGIN
      ALTER TABLE "WorkspaceTrialIdentity"
        ADD CONSTRAINT "WorkspaceTrialIdentity_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      ALTER TABLE "PendingWorkspaceCheckout"
        ADD CONSTRAINT "PendingWorkspaceCheckout_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      ALTER TABLE "PendingWorkspaceCheckout"
        ADD CONSTRAINT "PendingWorkspaceCheckout_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `UPDATE "User" AS u
    SET
      "workspaceTrialStartedAt" = history."firstTrialAt",
      "workspaceTrialConsumedAt" = history."firstTrialAt"
    FROM (
      SELECT tm."userId", MIN(ts."trialStartedAt") AS "firstTrialAt"
      FROM "TeamMember" tm
      INNER JOIN "TeamSubscription" ts ON ts."teamId" = tm."teamId"
      WHERE tm."role" = 'owner' AND ts."trialStartedAt" IS NOT NULL
      GROUP BY tm."userId"
    ) AS history
    WHERE u."id" = history."userId"
      AND u."workspaceTrialConsumedAt" IS NULL`,
  ];
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  const consumedUsers = await prisma.user.findMany({
    where: { workspaceTrialConsumedAt: { not: null } },
    select: { id: true, email: true },
  });
  for (const user of consumedUsers) {
    await syncWorkspaceTrialIdentity(user.id, user.email, prisma);
  }
}
