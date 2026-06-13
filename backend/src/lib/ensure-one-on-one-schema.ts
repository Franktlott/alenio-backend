import type { PrismaClient } from "@prisma/client";

/**
 * Creates 1:1 tables if missing (idempotent). Works without prisma CLI at runtime.
 * Fixes 500s when Railway preDeploy db push did not run or failed.
 */
export async function ensureOneOnOneSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OneOnOneTemplate" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "fields" TEXT NOT NULL,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OneOnOneTemplate_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OneOnOneTemplate_teamId_idx" ON "OneOnOneTemplate"("teamId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OneOnOneTemplate"
          ADD CONSTRAINT "OneOnOneTemplate_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OneOnOneTemplate"
          ADD CONSTRAINT "OneOnOneTemplate_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OneOnOneMeeting" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "memberUserId" TEXT NOT NULL,
        "templateId" TEXT,
        "templateTitle" TEXT NOT NULL,
        "templateFields" TEXT NOT NULL,
        "responses" TEXT NOT NULL,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OneOnOneMeeting_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OneOnOneMeeting_teamId_memberUserId_idx"
        ON "OneOnOneMeeting"("teamId", "memberUserId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OneOnOneMeeting"
          ADD CONSTRAINT "OneOnOneMeeting_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OneOnOneMeeting"
          ADD CONSTRAINT "OneOnOneMeeting_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "OneOnOneTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OneOnOneMeeting"
          ADD CONSTRAINT "OneOnOneMeeting_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OneOnOneTemplate" ADD COLUMN "libraryKey" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OneOnOneTemplate" ADD COLUMN "leaderPrep" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OneOnOneMeeting" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    console.log("[startup] 1:1 database tables ensured");

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Task" ADD COLUMN "oneOnOneMeetingId" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Task_oneOnOneMeetingId_idx" ON "Task"("oneOnOneMeetingId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Task"
          ADD CONSTRAINT "Task_oneOnOneMeetingId_fkey"
          FOREIGN KEY ("oneOnOneMeetingId") REFERENCES "OneOnOneMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  } catch (err) {
    console.error("[startup] ensureOneOnOneSchema failed:", err);
  }
}
