import type { PrismaClient } from "@prisma/client";

/** Creates development plan tables if missing (idempotent). */
export async function ensureDevelopmentPlanSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DevelopmentGoal" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "memberUserId" TEXT NOT NULL,
        "skill" TEXT NOT NULL,
        "steps" TEXT NOT NULL,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DevelopmentGoal_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "DevelopmentGoal_teamId_memberUserId_idx"
        ON "DevelopmentGoal"("teamId", "memberUserId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "DevelopmentGoal"
          ADD CONSTRAINT "DevelopmentGoal_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "DevelopmentGoal"
          ADD CONSTRAINT "DevelopmentGoal_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DevelopmentGoalNote" (
        "id" TEXT NOT NULL,
        "goalId" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DevelopmentGoalNote_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "DevelopmentGoalNote_goalId_idx" ON "DevelopmentGoalNote"("goalId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "DevelopmentGoalNote"
          ADD CONSTRAINT "DevelopmentGoalNote_goalId_fkey"
          FOREIGN KEY ("goalId") REFERENCES "DevelopmentGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "DevelopmentGoalNote"
          ADD CONSTRAINT "DevelopmentGoalNote_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log("[startup] development plan database tables ensured");
  } catch (err) {
    console.error("[startup] ensureDevelopmentPlanSchema failed:", err);
  }
}
