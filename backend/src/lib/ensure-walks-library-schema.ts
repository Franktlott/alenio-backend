import type { PrismaClient } from "@prisma/client";
import { backfillLibraryFromTemplateItems } from "./walks/library-service";

/** Creates Item Library / placement / publish / schedule tables (idempotent). */
export async function ensureWalksLibrarySchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`SELECT set_config('search_path', 'public', false)`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."WalkLibraryItem" (
      "id" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "category" TEXT NOT NULL DEFAULT 'Custom',
      "type" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "currentVersion" INTEGER NOT NULL DEFAULT 1,
      "createdByUserId" TEXT NOT NULL,
      "updatedByUserId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WalkLibraryItem_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WalkLibraryItem_teamId_status_idx"
    ON public."WalkLibraryItem"("teamId", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WalkLibraryItem_teamId_type_idx"
    ON public."WalkLibraryItem"("teamId", "type");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WalkLibraryItem_teamId_category_idx"
    ON public."WalkLibraryItem"("teamId", "category");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."WalkLibraryItemVersion" (
      "id" TEXT NOT NULL,
      "libraryItemId" TEXT NOT NULL,
      "version" INTEGER NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "instructions" TEXT,
      "requiredDefault" BOOLEAN NOT NULL DEFAULT true,
      "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "deviceMethods" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdByUserId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WalkLibraryItemVersion_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WalkLibraryItemVersion_libraryItemId_version_key"
    ON public."WalkLibraryItemVersion"("libraryItemId", "version");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."WalkTemplatePlacement" (
      "id" TEXT NOT NULL,
      "templateId" TEXT NOT NULL,
      "sectionId" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "libraryItemId" TEXT NOT NULL,
      "libraryItemVersionId" TEXT NOT NULL,
      "requiredOverride" BOOLEAN,
      "instructionsOverride" TEXT,
      "titleOverride" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WalkTemplatePlacement_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WalkTemplatePlacement_templateId_idx"
    ON public."WalkTemplatePlacement"("templateId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."WalkTemplateVersion" (
      "id" TEXT NOT NULL,
      "templateId" TEXT NOT NULL,
      "version" INTEGER NOT NULL,
      "snapshot" JSONB NOT NULL,
      "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "publishedByUserId" TEXT,
      CONSTRAINT "WalkTemplateVersion_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WalkTemplateVersion_templateId_version_key"
    ON public."WalkTemplateVersion"("templateId", "version");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."WalkSchedule" (
      "id" TEXT NOT NULL,
      "templateId" TEXT NOT NULL,
      "templateVersionId" TEXT,
      "name" TEXT,
      "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
      "recurrence" TEXT NOT NULL DEFAULT 'DAILY',
      "daysOfWeek" JSONB,
      "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "effectiveTo" TIMESTAMP(3),
      "assignScope" TEXT NOT NULL DEFAULT 'WORKSPACE',
      "assignRole" TEXT,
      "assignTeamId" TEXT,
      "assignUserIds" JSONB,
      "completionMode" TEXT NOT NULL DEFAULT 'ANY_ONE',
      "claimMode" TEXT NOT NULL DEFAULT 'FIRST_START_OWNS',
      "managerApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
      "requiredCompletionCount" INTEGER NOT NULL DEFAULT 1,
      "missedBehavior" TEXT NOT NULL DEFAULT 'MARK_MISSED',
      "notifyEnabled" BOOLEAN NOT NULL DEFAULT true,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WalkSchedule_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."WalkScheduleWindow" (
      "id" TEXT NOT NULL,
      "scheduleId" TEXT NOT NULL,
      "startMinutes" INTEGER NOT NULL,
      "dueMinutes" INTEGER NOT NULL,
      "graceMinutes" INTEGER NOT NULL DEFAULT 0,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "WalkScheduleWindow_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."WalkOccurrence" (
      "id" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "scheduleId" TEXT NOT NULL,
      "scheduleWindowId" TEXT,
      "templateId" TEXT NOT NULL,
      "templateVersionId" TEXT NOT NULL,
      "windowStart" TIMESTAMP(3) NOT NULL,
      "dueAt" TIMESTAMP(3) NOT NULL,
      "graceEndsAt" TIMESTAMP(3) NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'UPCOMING',
      "assignScope" TEXT NOT NULL DEFAULT 'WORKSPACE',
      "assignRole" TEXT,
      "assignUserIds" JSONB,
      "startedByUserId" TEXT,
      "completedByUserId" TEXT,
      "startedAt" TIMESTAMP(3),
      "completedAt" TIMESTAMP(3),
      "score" INTEGER,
      "runId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WalkOccurrence_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WalkOccurrence_scheduleId_windowStart_key"
    ON public."WalkOccurrence"("scheduleId", "windowStart");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "WalkOccurrence_runId_key"
    ON public."WalkOccurrence"("runId");
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."WalkTemplateItem"
    ADD COLUMN IF NOT EXISTS "libraryItemId" TEXT;
  `);

  // Recreate corrective actions table for library-version ownership when still on legacy shape.
  const caCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WalkCorrectiveAction'
  `);
  const names = new Set(caCols.map((c) => c.column_name));
  if (names.has("itemId") && !names.has("libraryItemVersionId")) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public."WalkCorrectiveActionResult" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public."WalkCorrectiveAction" CASCADE`);
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."WalkCorrectiveAction" (
      "id" TEXT NOT NULL,
      "libraryItemVersionId" TEXT NOT NULL,
      "trigger" TEXT NOT NULL DEFAULT 'ON_FAIL',
      "actionType" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "instructions" TEXT,
      "position" INTEGER NOT NULL DEFAULT 0,
      "required" BOOLEAN NOT NULL DEFAULT true,
      "blocksCompletion" BOOLEAN NOT NULL DEFAULT false,
      "config" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WalkCorrectiveAction_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."WalkCorrectiveAction"
    ADD COLUMN IF NOT EXISTS "blocksCompletion" BOOLEAN NOT NULL DEFAULT false;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."WalkCorrectiveActionResult" (
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

  const fks: string[] = [
    `DO $$ BEGIN ALTER TABLE public."WalkLibraryItem" ADD CONSTRAINT "WalkLibraryItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN ALTER TABLE public."WalkLibraryItemVersion" ADD CONSTRAINT "WalkLibraryItemVersion_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES public."WalkLibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN ALTER TABLE public."WalkTemplatePlacement" ADD CONSTRAINT "WalkTemplatePlacement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."WalkTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN ALTER TABLE public."WalkTemplatePlacement" ADD CONSTRAINT "WalkTemplatePlacement_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES public."WalkLibraryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN ALTER TABLE public."WalkTemplatePlacement" ADD CONSTRAINT "WalkTemplatePlacement_libraryItemVersionId_fkey" FOREIGN KEY ("libraryItemVersionId") REFERENCES public."WalkLibraryItemVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN ALTER TABLE public."WalkCorrectiveAction" ADD CONSTRAINT "WalkCorrectiveAction_libraryItemVersionId_fkey" FOREIGN KEY ("libraryItemVersionId") REFERENCES public."WalkLibraryItemVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  ];
  for (const sql of fks) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      console.warn("[startup] ensureWalksLibrarySchema fk skipped", err);
    }
  }

  try {
    const result = await backfillLibraryFromTemplateItems();
    console.log("[startup] walk library backfill", result);
  } catch (err) {
    console.warn("[startup] walk library backfill skipped", err);
  }
}
