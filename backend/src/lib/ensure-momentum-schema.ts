import type { PrismaClient } from "@prisma/client";

/** Idempotent additive rollout for canonical Momentum evidence and projections. */
export async function ensureMomentumSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamMember" ADD COLUMN "currentStreak" INTEGER NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamMember" ADD COLUMN "personalBestStreak" INTEGER NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamMember" ADD COLUMN "personalBestCelebrated" BOOLEAN NOT NULL DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamMember" ADD COLUMN "momentumRunStartedAt" TIMESTAMP(3);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamMember" ADD COLUMN "momentumLastQualifiedAt" TIMESTAMP(3);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TeamMember_teamId_momentumLastQualifiedAt_idx"
      ON "TeamMember"("teamId", "momentumLastQualifiedAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MomentumCompletionCredit" (
      "id" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "sourceTaskId" TEXT NOT NULL,
      "creditedUserId" TEXT NOT NULL,
      "creditedTeamMemberId" TEXT,
      "sourceTaskTitle" TEXT,
      "sourceTaskIncognito" BOOLEAN NOT NULL DEFAULT false,
      "dueAt" TIMESTAMP(3) NOT NULL,
      "completedAt" TIMESTAMP(3) NOT NULL,
      "onTime" BOOLEAN NOT NULL,
      "revokedAt" TIMESTAMP(3),
      "revocationReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MomentumCompletionCredit_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "MomentumCompletionCredit_teamId_sourceTaskId_creditedUserId_key"
      ON "MomentumCompletionCredit"("teamId", "sourceTaskId", "creditedUserId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "MomentumCompletionCredit_teamId_creditedUserId_revokedAt_completedAt_idx"
      ON "MomentumCompletionCredit"("teamId", "creditedUserId", "revokedAt", "completedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "MomentumCompletionCredit_teamId_revokedAt_completedAt_idx"
      ON "MomentumCompletionCredit"("teamId", "revokedAt", "completedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "MomentumCompletionCredit_creditedTeamMemberId_idx"
      ON "MomentumCompletionCredit"("creditedTeamMemberId");
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "MomentumCompletionCredit"
        ADD CONSTRAINT "MomentumCompletionCredit_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "MomentumCompletionCredit"
        ADD CONSTRAINT "MomentumCompletionCredit_creditedTeamMemberId_fkey"
        FOREIGN KEY ("creditedTeamMemberId") REFERENCES "TeamMember"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}
