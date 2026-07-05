import type { PrismaClient } from "@prisma/client";

/** Creates HACCP / food safety tables if missing (idempotent). */
export async function ensureHaccpSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HaccpTemplate" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'custom',
        "workplace" TEXT NOT NULL DEFAULT 'Kitchen',
        "frequency" TEXT NOT NULL DEFAULT 'daily',
        "windowStart" TEXT,
        "windowEnd" TEXT,
        "dueLabel" TEXT,
        "photoRequired" BOOLEAN NOT NULL DEFAULT false,
        "noteRequired" BOOLEAN NOT NULL DEFAULT false,
        "bluetoothMode" TEXT NOT NULL DEFAULT 'preferred',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdByUserId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "HaccpTemplate_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HaccpTemplate_teamId_isActive_idx" ON "HaccpTemplate"("teamId", "isActive");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HaccpTemplateItem" (
        "id" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "minTempF" DOUBLE PRECISION,
        "maxTempF" DOUBLE PRECISION,
        "allowNa" BOOLEAN NOT NULL DEFAULT false,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "HaccpTemplateItem_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HaccpTemplateItem_templateId_idx" ON "HaccpTemplateItem"("templateId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HaccpSchedule" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "weekday" INTEGER,
        "windowStart" TEXT NOT NULL,
        "windowEnd" TEXT NOT NULL,
        "dueLabel" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        CONSTRAINT "HaccpSchedule_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HaccpSchedule_teamId_templateId_idx" ON "HaccpSchedule"("teamId", "templateId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HaccpRun" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "templateName" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'in_progress',
        "windowStart" TEXT,
        "windowEnd" TEXT,
        "dueLabel" TEXT,
        "dueAt" TIMESTAMP(3),
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP(3),
        "completedByUserId" TEXT,
        "completedByName" TEXT,
        "deviceId" TEXT,
        "itemsTotal" INTEGER NOT NULL DEFAULT 0,
        "itemsCompleted" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "HaccpRun_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HaccpRun_teamId_startedAt_idx" ON "HaccpRun"("teamId", "startedAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HaccpRunItem" (
        "id" TEXT NOT NULL,
        "runId" TEXT NOT NULL,
        "templateItemId" TEXT,
        "label" TEXT NOT NULL,
        "minTempF" DOUBLE PRECISION,
        "maxTempF" DOUBLE PRECISION,
        "allowNa" BOOLEAN NOT NULL DEFAULT false,
        "readingF" DOUBLE PRECISION,
        "status" TEXT,
        "entryMethod" TEXT,
        "notes" TEXT,
        "photoUrl" TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "completedAt" TIMESTAMP(3),
        CONSTRAINT "HaccpRunItem_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HaccpRunItem_runId_idx" ON "HaccpRunItem"("runId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HaccpCorrectiveAction" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "runId" TEXT,
        "runItemId" TEXT,
        "coolingLogId" TEXT,
        "actionType" TEXT NOT NULL,
        "notes" TEXT,
        "photoUrl" TEXT,
        "status" TEXT NOT NULL DEFAULT 'open',
        "performedByUserId" TEXT,
        "performedByName" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "resolvedAt" TIMESTAMP(3),
        CONSTRAINT "HaccpCorrectiveAction_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HaccpCorrectiveAction_teamId_status_idx" ON "HaccpCorrectiveAction"("teamId", "status");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HaccpCoolingLog" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "itemName" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "firstTempF" DOUBLE PRECISION NOT NULL,
        "nextReadingDueAt" TIMESTAMP(3) NOT NULL,
        "readings" JSONB NOT NULL DEFAULT '[]',
        "createdByName" TEXT NOT NULL,
        "deviceId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "HaccpCoolingLog_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HaccpCoolingLog_teamId_status_idx" ON "HaccpCoolingLog"("teamId", "status");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HaccpProbeCalibration" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "targetTempF" DOUBLE PRECISION NOT NULL DEFAULT 32,
        "actualTempF" DOUBLE PRECISION NOT NULL,
        "passed" BOOLEAN NOT NULL,
        "performedByUserId" TEXT,
        "performedByName" TEXT NOT NULL,
        "deviceId" TEXT,
        "nextDueAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "HaccpProbeCalibration_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HaccpProbeCalibration_teamId_createdAt_idx" ON "HaccpProbeCalibration"("teamId", "createdAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "HaccpAuditEvent" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "metadata" JSONB,
        "actorName" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "HaccpAuditEvent_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "HaccpAuditEvent_teamId_createdAt_idx" ON "HaccpAuditEvent"("teamId", "createdAt");
    `);
    console.log("[startup] HACCP schema ensured");
  } catch (err) {
    console.error("[startup] ensureHaccpSchema failed:", err);
  }
}
