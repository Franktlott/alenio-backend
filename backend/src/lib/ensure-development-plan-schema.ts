import type { PrismaClient } from "@prisma/client";

/** Creates development plan tables if missing (idempotent). */
export async function ensureDevelopmentPlanSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "public"."DevelopmentGoal" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "memberUserId" TEXT NOT NULL,
        "skill" TEXT NOT NULL,
        "description" TEXT,
        "dueDate" TIMESTAMP(3),
        "priority" TEXT NOT NULL DEFAULT 'normal',
        "steps" TEXT NOT NULL,
        "completedStepIndexes" TEXT NOT NULL DEFAULT '[]',
        "completedStepDates" TEXT NOT NULL DEFAULT '{}',
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DevelopmentGoal_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "DevelopmentGoal_teamId_memberUserId_idx"
        ON "public"."DevelopmentGoal"("teamId", "memberUserId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "public"."DevelopmentGoal"
          ADD CONSTRAINT "DevelopmentGoal_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "public"."DevelopmentGoal"
          ADD CONSTRAINT "DevelopmentGoal_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "public"."DevelopmentGoalNote" (
        "id" TEXT NOT NULL,
        "goalId" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DevelopmentGoalNote_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "DevelopmentGoalNote_goalId_idx" ON "public"."DevelopmentGoalNote"("goalId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "public"."DevelopmentGoalNote"
          ADD CONSTRAINT "DevelopmentGoalNote_goalId_fkey"
          FOREIGN KEY ("goalId") REFERENCES "public"."DevelopmentGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "public"."DevelopmentGoalNote"
          ADD CONSTRAINT "DevelopmentGoalNote_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."DevelopmentGoal"
        ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."DevelopmentGoal"
        ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."DevelopmentGoal"
        ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."DevelopmentGoal"
        ADD COLUMN IF NOT EXISTS "completedStepIndexes" TEXT NOT NULL DEFAULT '[]';
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."DevelopmentGoal"
        ADD COLUMN IF NOT EXISTS "completedStepDates" TEXT NOT NULL DEFAULT '{}';
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."DevelopmentGoal"
        ADD COLUMN IF NOT EXISTS "description" TEXT;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."DevelopmentGoal"
        ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."DevelopmentGoal"
        ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal';
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."DevelopmentGoal"
        ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "DevelopmentGoal_teamId_memberUserId_archivedAt_idx"
        ON "public"."DevelopmentGoal"("teamId", "memberUserId", "archivedAt");
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE "public"."DevelopmentGoal"
      SET "lastActivityAt" = "createdAt"
      WHERE "lastActivityAt" IS NULL;
    `);

    console.log("[startup] development plan database tables ensured");
  } catch (err) {
    console.error("[startup] ensureDevelopmentPlanSchema failed:", err);
  }
}
