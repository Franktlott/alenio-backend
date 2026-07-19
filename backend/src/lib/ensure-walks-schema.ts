import type { PrismaClient } from "@prisma/client";
import { ensureWalksLibrarySchema } from "./ensure-walks-library-schema";

export type WalksSchemaEnsureResult = {
  ok: boolean;
  steps: string[];
  error?: string;
  tablesPublic?: string[];
  tablesNeonAuth?: string[];
  walkTemplateCount?: number | null;
  countError?: string;
};

async function execStep(
  prisma: PrismaClient,
  steps: string[],
  label: string,
  sql: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(sql);
  steps.push(label);
}

/** Additive Walk Builder columns/tables (idempotent). Always targets public schema. */
export async function ensureWalksSchema(prisma: PrismaClient): Promise<WalksSchemaEnsureResult> {
  const steps: string[] = [];
  try {
    // Pin search_path so CREATE/ALTER never land in neon_auth by accident.
    await execStep(
      prisma,
      steps,
      "search_path",
      `SELECT set_config('search_path', 'public', false)`,
    );

    await execStep(
      prisma,
      steps,
      "WalkTemplate",
      `
      CREATE TABLE IF NOT EXISTS public."WalkTemplate" (
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
    `,
    );
    await execStep(
      prisma,
      steps,
      "WalkTemplate_idx_active",
      `CREATE INDEX IF NOT EXISTS "WalkTemplate_teamId_isActive_idx" ON public."WalkTemplate"("teamId", "isActive")`,
    );
    await execStep(
      prisma,
      steps,
      "WalkTemplate_idx_status",
      `CREATE INDEX IF NOT EXISTS "WalkTemplate_teamId_status_idx" ON public."WalkTemplate"("teamId", "status")`,
    );

    await execStep(
      prisma,
      steps,
      "WalkTemplateSection",
      `
      CREATE TABLE IF NOT EXISTS public."WalkTemplateSection" (
        "id" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WalkTemplateSection_pkey" PRIMARY KEY ("id")
      );
    `,
    );
    await execStep(
      prisma,
      steps,
      "WalkTemplateSection_idx",
      `CREATE INDEX IF NOT EXISTS "WalkTemplateSection_templateId_idx" ON public."WalkTemplateSection"("templateId")`,
    );

    await execStep(
      prisma,
      steps,
      "WalkTemplateItem",
      `
      CREATE TABLE IF NOT EXISTS public."WalkTemplateItem" (
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
    `,
    );
    await execStep(
      prisma,
      steps,
      "WalkTemplateItem_idx_template",
      `CREATE INDEX IF NOT EXISTS "WalkTemplateItem_templateId_idx" ON public."WalkTemplateItem"("templateId")`,
    );
    await execStep(
      prisma,
      steps,
      "WalkTemplateItem_idx_section",
      `CREATE INDEX IF NOT EXISTS "WalkTemplateItem_sectionId_idx" ON public."WalkTemplateItem"("sectionId")`,
    );

    const alters: Array<[string, string]> = [
      ["WalkTemplate.description", `ALTER TABLE public."WalkTemplate" ADD COLUMN IF NOT EXISTS "description" TEXT`],
      ["WalkTemplate.status", `ALTER TABLE public."WalkTemplate" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT'`],
      ["WalkTemplate.version", `ALTER TABLE public."WalkTemplate" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1`],
      ["WalkTemplate.estimatedDurationMinutes", `ALTER TABLE public."WalkTemplate" ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER`],
      ["WalkTemplate.publishedAt", `ALTER TABLE public."WalkTemplate" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3)`],
      ["WalkTemplate.publishedByUserId", `ALTER TABLE public."WalkTemplate" ADD COLUMN IF NOT EXISTS "publishedByUserId" TEXT`],
      ["WalkTemplate.parentTemplateId", `ALTER TABLE public."WalkTemplate" ADD COLUMN IF NOT EXISTS "parentTemplateId" TEXT`],
      ["WalkTemplateSection.description", `ALTER TABLE public."WalkTemplateSection" ADD COLUMN IF NOT EXISTS "description" TEXT`],
      ["WalkTemplateSection.createdAt", `ALTER TABLE public."WalkTemplateSection" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`],
      ["WalkTemplateSection.updatedAt", `ALTER TABLE public."WalkTemplateSection" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`],
      ["WalkTemplateItem.type", `ALTER TABLE public."WalkTemplateItem" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'YES_NO'`],
      ["WalkTemplateItem.description", `ALTER TABLE public."WalkTemplateItem" ADD COLUMN IF NOT EXISTS "description" TEXT`],
      ["WalkTemplateItem.instructions", `ALTER TABLE public."WalkTemplateItem" ADD COLUMN IF NOT EXISTS "instructions" TEXT`],
      ["WalkTemplateItem.required", `ALTER TABLE public."WalkTemplateItem" ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT true`],
      ["WalkTemplateItem.failureBehavior", `ALTER TABLE public."WalkTemplateItem" ADD COLUMN IF NOT EXISTS "failureBehavior" TEXT`],
      ["WalkTemplateItem.config", `ALTER TABLE public."WalkTemplateItem" ADD COLUMN IF NOT EXISTS "config" JSONB NOT NULL DEFAULT '{}'::jsonb`],
      ["WalkTemplateItem.createdAt", `ALTER TABLE public."WalkTemplateItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`],
      ["WalkTemplateItem.updatedAt", `ALTER TABLE public."WalkTemplateItem" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`],
    ];
    for (const [label, sql] of alters) {
      try {
        await execStep(prisma, steps, label, sql);
      } catch (err) {
        console.warn(`[startup] ensureWalksSchema alter skipped (${label}):`, err);
      }
    }

    await execStep(
      prisma,
      steps,
      "WalkRun",
      `
      CREATE TABLE IF NOT EXISTS public."WalkRun" (
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
    `,
    );
    await execStep(
      prisma,
      steps,
      "WalkRun_idx_team",
      `CREATE INDEX IF NOT EXISTS "WalkRun_teamId_startedAt_idx" ON public."WalkRun"("teamId", "startedAt")`,
    );
    await execStep(
      prisma,
      steps,
      "WalkRun_idx_template",
      `CREATE INDEX IF NOT EXISTS "WalkRun_templateId_startedAt_idx" ON public."WalkRun"("templateId", "startedAt")`,
    );

    await execStep(
      prisma,
      steps,
      "WalkItemResponse",
      `
      CREATE TABLE IF NOT EXISTS public."WalkItemResponse" (
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
    `,
    );
    // Older DBs may have WalkItemResponse without itemId — CREATE TABLE IF NOT EXISTS won't add it.
    const responseAlters: Array<[string, string]> = [
      ["WalkItemResponse.itemId", `ALTER TABLE public."WalkItemResponse" ADD COLUMN IF NOT EXISTS "itemId" TEXT`],
      ["WalkItemResponse.itemType", `ALTER TABLE public."WalkItemResponse" ADD COLUMN IF NOT EXISTS "itemType" TEXT`],
      ["WalkItemResponse.status", `ALTER TABLE public."WalkItemResponse" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'NOT_STARTED'`],
      ["WalkItemResponse.response", `ALTER TABLE public."WalkItemResponse" ADD COLUMN IF NOT EXISTS "response" JSONB`],
      ["WalkItemResponse.failed", `ALTER TABLE public."WalkItemResponse" ADD COLUMN IF NOT EXISTS "failed" BOOLEAN NOT NULL DEFAULT false`],
      ["WalkItemResponse.notes", `ALTER TABLE public."WalkItemResponse" ADD COLUMN IF NOT EXISTS "notes" TEXT`],
      ["WalkItemResponse.photoUrls", `ALTER TABLE public."WalkItemResponse" ADD COLUMN IF NOT EXISTS "photoUrls" JSONB`],
      ["WalkItemResponse.completedBy", `ALTER TABLE public."WalkItemResponse" ADD COLUMN IF NOT EXISTS "completedBy" TEXT`],
      ["WalkItemResponse.completedAt", `ALTER TABLE public."WalkItemResponse" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3)`],
    ];
    for (const [label, sql] of responseAlters) {
      try {
        await execStep(prisma, steps, label, sql);
      } catch (err) {
        console.warn(`[startup] ensureWalksSchema alter skipped (${label}):`, err);
      }
    }
    try {
      await execStep(
        prisma,
        steps,
        "WalkItemResponse_uq",
        `CREATE UNIQUE INDEX IF NOT EXISTS "WalkItemResponse_runId_itemId_key" ON public."WalkItemResponse"("runId", "itemId")`,
      );
    } catch (err) {
      console.warn("[startup] ensureWalksSchema index skipped (WalkItemResponse_uq):", err);
    }
    try {
      await execStep(
        prisma,
        steps,
        "WalkItemResponse_idx",
        `CREATE INDEX IF NOT EXISTS "WalkItemResponse_runId_idx" ON public."WalkItemResponse"("runId")`,
      );
    } catch (err) {
      console.warn("[startup] ensureWalksSchema index skipped (WalkItemResponse_idx):", err);
    }

    await execStep(
      prisma,
      steps,
      "WalkCorrectiveAction",
      `
      CREATE TABLE IF NOT EXISTS public."WalkCorrectiveAction" (
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
    `,
    );
    // Only index legacy itemId when that column exists (library schema may already own this table).
    try {
      const caCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'WalkCorrectiveAction'
      `);
      const caNames = new Set(caCols.map((c) => c.column_name));
      if (caNames.has("itemId")) {
        await execStep(
          prisma,
          steps,
          "WalkCorrectiveAction_idx",
          `CREATE INDEX IF NOT EXISTS "WalkCorrectiveAction_itemId_idx" ON public."WalkCorrectiveAction"("itemId")`,
        );
      } else {
        steps.push("WalkCorrectiveAction_idx_skipped");
      }
    } catch (err) {
      console.warn("[startup] ensureWalksSchema index skipped (WalkCorrectiveAction_idx):", err);
    }

    await execStep(
      prisma,
      steps,
      "WalkCorrectiveActionResult",
      `
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
    `,
    );
    await execStep(
      prisma,
      steps,
      "WalkCorrectiveActionResult_uq",
      `CREATE UNIQUE INDEX IF NOT EXISTS "WalkCorrectiveActionResult_itemResponseId_correctiveActionId_key" ON public."WalkCorrectiveActionResult"("itemResponseId", "correctiveActionId")`,
    );
    await execStep(
      prisma,
      steps,
      "WalkCorrectiveActionResult_idx",
      `CREATE INDEX IF NOT EXISTS "WalkCorrectiveActionResult_itemResponseId_idx" ON public."WalkCorrectiveActionResult"("itemResponseId")`,
    );

    const fks: Array<[string, string]> = [
      [
        "fk_WalkTemplate_team",
        `DO $$ BEGIN
          ALTER TABLE public."WalkTemplate"
            ADD CONSTRAINT "WalkTemplate_teamId_fkey"
            FOREIGN KEY ("teamId") REFERENCES public."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
      [
        "fk_WalkTemplateSection_template",
        `DO $$ BEGIN
          ALTER TABLE public."WalkTemplateSection"
            ADD CONSTRAINT "WalkTemplateSection_templateId_fkey"
            FOREIGN KEY ("templateId") REFERENCES public."WalkTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
      [
        "fk_WalkTemplateItem_template",
        `DO $$ BEGIN
          ALTER TABLE public."WalkTemplateItem"
            ADD CONSTRAINT "WalkTemplateItem_templateId_fkey"
            FOREIGN KEY ("templateId") REFERENCES public."WalkTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
      [
        "fk_WalkTemplateItem_section",
        `DO $$ BEGIN
          ALTER TABLE public."WalkTemplateItem"
            ADD CONSTRAINT "WalkTemplateItem_sectionId_fkey"
            FOREIGN KEY ("sectionId") REFERENCES public."WalkTemplateSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
      [
        "fk_WalkRun_team",
        `DO $$ BEGIN
          ALTER TABLE public."WalkRun"
            ADD CONSTRAINT "WalkRun_teamId_fkey"
            FOREIGN KEY ("teamId") REFERENCES public."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
      [
        "fk_WalkRun_template",
        `DO $$ BEGIN
          ALTER TABLE public."WalkRun"
            ADD CONSTRAINT "WalkRun_templateId_fkey"
            FOREIGN KEY ("templateId") REFERENCES public."WalkTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
      [
        "fk_WalkItemResponse_run",
        `DO $$ BEGIN
          ALTER TABLE public."WalkItemResponse"
            ADD CONSTRAINT "WalkItemResponse_runId_fkey"
            FOREIGN KEY ("runId") REFERENCES public."WalkRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
      [
        "fk_WalkCorrectiveAction_item",
        `DO $$ BEGIN
          ALTER TABLE public."WalkCorrectiveAction"
            ADD CONSTRAINT "WalkCorrectiveAction_itemId_fkey"
            FOREIGN KEY ("itemId") REFERENCES public."WalkTemplateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
      [
        "fk_WalkCorrectiveActionResult_response",
        `DO $$ BEGIN
          ALTER TABLE public."WalkCorrectiveActionResult"
            ADD CONSTRAINT "WalkCorrectiveActionResult_itemResponseId_fkey"
            FOREIGN KEY ("itemResponseId") REFERENCES public."WalkItemResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
      [
        "fk_WalkCorrectiveActionResult_action",
        `DO $$ BEGIN
          ALTER TABLE public."WalkCorrectiveActionResult"
            ADD CONSTRAINT "WalkCorrectiveActionResult_correctiveActionId_fkey"
            FOREIGN KEY ("correctiveActionId") REFERENCES public."WalkCorrectiveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;`,
      ],
    ];
    for (const [label, sql] of fks) {
      try {
        await execStep(prisma, steps, label, sql);
      } catch (err) {
        console.warn(`[startup] ensureWalksSchema fk skipped (${label}):`, err);
      }
    }

    const tablesPublic = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'Walk%'
      ORDER BY table_name
    `);
    const tablesNeonAuth = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'neon_auth' AND table_name LIKE 'Walk%'
      ORDER BY table_name
    `);

    let walkTemplateCount: number | null = null;
    let countError: string | undefined;
    try {
      walkTemplateCount = await prisma.walkTemplate.count();
    } catch (err) {
      countError = err instanceof Error ? err.message : String(err);
    }

    try {
      await execStep(
        prisma,
        steps,
        "WalkSchedule.intervalMinutes",
        `ALTER TABLE public."WalkSchedule" ADD COLUMN IF NOT EXISTS "intervalMinutes" INTEGER`,
      );
    } catch (err) {
      console.warn("[startup] ensureWalksSchema alter skipped (WalkSchedule.intervalMinutes):", err);
    }

    try {
      await ensureWalksLibrarySchema(prisma);
      steps.push("library_schema");
    } catch (err) {
      console.error("[startup] ensureWalksLibrarySchema failed:", err);
    }

    console.log("[startup] ensureWalksSchema ok", {
      steps: steps.length,
      tablesPublic: tablesPublic.map((t) => t.table_name),
      walkTemplateCount,
      countError,
    });

    return {
      ok: !countError,
      steps,
      tablesPublic: tablesPublic.map((t) => t.table_name),
      tablesNeonAuth: tablesNeonAuth.map((t) => t.table_name),
      walkTemplateCount,
      countError,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[startup] ensureWalksSchema failed:", err);
    return { ok: false, steps, error: message };
  }
}
