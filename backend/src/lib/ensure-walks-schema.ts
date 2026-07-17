import type { PrismaClient } from "@prisma/client";

/** Additive Walk Builder columns/tables (idempotent). Creates base tables if missing. */
export async function ensureWalksSchema(prisma: PrismaClient): Promise<void> {
  try {
    // Base template tables may never have been pushed to prod — create first, then evolve.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalkTemplate" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "workplace" TEXT NOT NULL DEFAULT '',
        "scoringEnabled" BOOLEAN NOT NULL DEFAULT true,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "version" INTEGER NOT NULL DEFAULT 1,
        "estimatedDurationMinutes" INTEGER,
        "publishedAt" TIMESTAMP(3),
        "publishedByUserId" TEXT,
        "parentTemplateId" TEXT,
        "createdByUserId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WalkTemplate_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkTemplate_teamId_isActive_idx"
      ON "WalkTemplate"("teamId", "isActive");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkTemplate_teamId_status_idx"
      ON "WalkTemplate"("teamId", "status");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalkTemplateSection" (
        "id" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WalkTemplateSection_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkTemplateSection_templateId_idx"
      ON "WalkTemplateSection"("templateId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalkTemplateItem" (
        "id" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "sectionId" TEXT,
        "type" TEXT NOT NULL DEFAULT 'YES_NO',
        "label" TEXT NOT NULL,
        "description" TEXT,
        "instructions" TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "required" BOOLEAN NOT NULL DEFAULT true,
        "failureBehavior" TEXT,
        "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WalkTemplateItem_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkTemplateItem_templateId_idx"
      ON "WalkTemplateItem"("templateId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkTemplateItem_sectionId_idx"
      ON "WalkTemplateItem"("sectionId");
    `);

    // Evolve older / partial tables that predate Walk Builder columns.
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
        ALTER TABLE "WalkTemplate"
          ADD CONSTRAINT "WalkTemplate_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkTemplateSection"
          ADD CONSTRAINT "WalkTemplateSection_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "WalkTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkTemplateItem"
          ADD CONSTRAINT "WalkTemplateItem_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "WalkTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkTemplateItem"
          ADD CONSTRAINT "WalkTemplateItem_sectionId_fkey"
          FOREIGN KEY ("sectionId") REFERENCES "WalkTemplateSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
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

    console.log("[startup] ensureWalksSchema ok");
  } catch (err) {
    console.error("[startup] ensureWalksSchema failed:", err);
  }
}
