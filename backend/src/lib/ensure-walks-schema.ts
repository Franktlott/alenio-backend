import type { PrismaClient } from "@prisma/client";

/** Additive Walk Builder columns/tables (idempotent). */
export async function ensureWalksSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplate" ADD COLUMN IF NOT EXISTS "description" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplate" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT';
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplate" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplate" ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplate" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplate" ADD COLUMN IF NOT EXISTS "publishedByUserId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplate" ADD COLUMN IF NOT EXISTS "parentTemplateId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkTemplate_teamId_status_idx" ON "WalkTemplate"("teamId", "status");
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateSection" ADD COLUMN IF NOT EXISTS "description" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateSection" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateSection" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateItem" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'YES_NO';
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateItem" ADD COLUMN IF NOT EXISTS "description" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateItem" ADD COLUMN IF NOT EXISTS "instructions" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateItem" ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT true;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateItem" ADD COLUMN IF NOT EXISTS "failureBehavior" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateItem" ADD COLUMN IF NOT EXISTS "config" JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "WalkTemplateItem" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalkRun" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "templateVersion" INTEGER NOT NULL,
        "templateSnapshot" JSONB NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
        "startedByUserId" TEXT,
        "startedByName" TEXT,
        "deviceId" TEXT,
        "isTest" BOOLEAN NOT NULL DEFAULT false,
        "testSessionId" TEXT,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP(3),
        "score" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WalkRun_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkRun_teamId_startedAt_idx" ON "WalkRun"("teamId", "startedAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkRun_templateId_startedAt_idx" ON "WalkRun"("templateId", "startedAt");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalkItemResponse" (
        "id" TEXT NOT NULL,
        "runId" TEXT NOT NULL,
        "itemId" TEXT NOT NULL,
        "itemType" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
        "response" JSONB,
        "failed" BOOLEAN NOT NULL DEFAULT false,
        "notes" TEXT,
        "photoUrls" JSONB,
        "completedBy" TEXT,
        "completedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WalkItemResponse_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "WalkItemResponse_runId_itemId_key"
      ON "WalkItemResponse"("runId", "itemId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkItemResponse_runId_idx" ON "WalkItemResponse"("runId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalkCorrectiveAction" (
        "id" TEXT NOT NULL,
        "itemId" TEXT NOT NULL,
        "trigger" TEXT NOT NULL DEFAULT 'ON_FAIL',
        "actionType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "instructions" TEXT,
        "position" INTEGER NOT NULL DEFAULT 0,
        "required" BOOLEAN NOT NULL DEFAULT true,
        "config" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WalkCorrectiveAction_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkCorrectiveAction_itemId_idx" ON "WalkCorrectiveAction"("itemId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalkCorrectiveActionResult" (
        "id" TEXT NOT NULL,
        "itemResponseId" TEXT NOT NULL,
        "correctiveActionId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "response" JSONB,
        "completedBy" TEXT,
        "completedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WalkCorrectiveActionResult_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "WalkCorrectiveActionResult_itemResponseId_correctiveActionId_key"
      ON "WalkCorrectiveActionResult"("itemResponseId", "correctiveActionId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkCorrectiveActionResult_itemResponseId_idx"
      ON "WalkCorrectiveActionResult"("itemResponseId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkRun"
          ADD CONSTRAINT "WalkRun_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkRun"
          ADD CONSTRAINT "WalkRun_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "WalkTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkItemResponse"
          ADD CONSTRAINT "WalkItemResponse_runId_fkey"
          FOREIGN KEY ("runId") REFERENCES "WalkRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkCorrectiveAction"
          ADD CONSTRAINT "WalkCorrectiveAction_itemId_fkey"
          FOREIGN KEY ("itemId") REFERENCES "WalkTemplateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkCorrectiveActionResult"
          ADD CONSTRAINT "WalkCorrectiveActionResult_itemResponseId_fkey"
          FOREIGN KEY ("itemResponseId") REFERENCES "WalkItemResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkCorrectiveActionResult"
          ADD CONSTRAINT "WalkCorrectiveActionResult_correctiveActionId_fkey"
          FOREIGN KEY ("correctiveActionId") REFERENCES "WalkCorrectiveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  } catch (err) {
    console.error("[startup] ensureWalksSchema failed:", err);
  }
}
