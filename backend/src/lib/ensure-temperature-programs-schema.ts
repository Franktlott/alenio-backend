import type { PrismaClient } from "@prisma/client";

/** Creates temperature program admin tables if missing (idempotent). */
export async function ensureTemperatureProgramsSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempProgram" (
        "id" TEXT NOT NULL,
        "programFamilyId" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "versionNumber" INTEGER NOT NULL DEFAULT 1,
        "isLocked" BOOLEAN NOT NULL DEFAULT false,
        "createdByUserId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempProgram_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "TempProgram_programFamilyId_versionNumber_key"
      ON "TempProgram"("programFamilyId", "versionNumber");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempProgram_teamId_status_idx" ON "TempProgram"("teamId", "status");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempProgram_teamId_programFamilyId_idx" ON "TempProgram"("teamId", "programFamilyId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempProgram_programFamilyId_idx" ON "TempProgram"("programFamilyId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempEquipmentGroup" (
        "id" TEXT NOT NULL,
        "programId" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempEquipmentGroup_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempEquipmentGroup_programId_isActive_idx"
      ON "TempEquipmentGroup"("programId", "isActive");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempEquipmentItem" (
        "id" TEXT NOT NULL,
        "programId" TEXT NOT NULL,
        "equipmentGroupId" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "equipmentType" TEXT,
        "locationHint" TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isRequired" BOOLEAN NOT NULL DEFAULT true,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempEquipmentItem_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempEquipmentItem_programId_isActive_idx"
      ON "TempEquipmentItem"("programId", "isActive");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCheckItem" (
        "id" TEXT NOT NULL,
        "programId" TEXT NOT NULL,
        "equipmentId" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "instruction" TEXT,
        "productName" TEXT,
        "tempUnit" TEXT NOT NULL DEFAULT 'F',
        "minTemp" DOUBLE PRECISION,
        "maxTemp" DOUBLE PRECISION,
        "targetTemp" DOUBLE PRECISION,
        "checkType" TEXT NOT NULL,
        "allowNa" BOOLEAN NOT NULL DEFAULT false,
        "requireCommentIfNa" BOOLEAN NOT NULL DEFAULT false,
        "requirePhoto" BOOLEAN NOT NULL DEFAULT false,
        "manualEntryAllowed" BOOLEAN NOT NULL DEFAULT true,
        "bluetoothProbeAllowed" BOOLEAN NOT NULL DEFAULT false,
        "bluetoothProbeRequired" BOOLEAN NOT NULL DEFAULT false,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempCheckItem_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckItem_programId_isActive_idx" ON "TempCheckItem"("programId", "isActive");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCheckSchedule" (
        "id" TEXT NOT NULL,
        "programId" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "scheduleType" TEXT NOT NULL,
        "specificTimes" JSONB NOT NULL DEFAULT '[]',
        "intervalHours" INTEGER,
        "windowBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
        "windowAfterMinutes" INTEGER NOT NULL DEFAULT 0,
        "daysOfWeek" JSONB NOT NULL DEFAULT '[]',
        "timezone" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempCheckSchedule_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckSchedule_programId_isActive_idx"
      ON "TempCheckSchedule"("programId", "isActive");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempProgramAssignment" (
        "id" TEXT NOT NULL,
        "programId" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "assignmentType" TEXT NOT NULL,
        "assignmentTargetId" TEXT NOT NULL,
        "effectiveStartDate" TIMESTAMP(3),
        "effectiveEndDate" TIMESTAMP(3),
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempProgramAssignment_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempProgramAssignment_programId_isActive_idx"
      ON "TempProgramAssignment"("programId", "isActive");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempProgramAssignment_teamId_assignmentType_assignmentTargetId_idx"
      ON "TempProgramAssignment"("teamId", "assignmentType", "assignmentTargetId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCorrectiveActionTemplate" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "programId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "actionType" TEXT NOT NULL,
        "requiresRecheck" BOOLEAN NOT NULL DEFAULT false,
        "recheckDelayMinutes" INTEGER,
        "requiresComment" BOOLEAN NOT NULL DEFAULT false,
        "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
        "requiresManagerApproval" BOOLEAN NOT NULL DEFAULT false,
        "closeAfterAction" BOOLEAN NOT NULL DEFAULT false,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempCorrectiveActionTemplate_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCorrectiveActionTemplate_programId_isActive_idx"
      ON "TempCorrectiveActionTemplate"("programId", "isActive");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCorrectiveActionRule" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "programId" TEXT NOT NULL,
        "checkItemId" TEXT NOT NULL,
        "correctiveActionTemplateId" TEXT NOT NULL,
        "conditionType" TEXT NOT NULL,
        "isDefault" BOOLEAN NOT NULL DEFAULT false,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempCorrectiveActionRule_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "TempCorrectiveActionRule_checkItemId_correctiveActionTemplateId_conditionType_key"
      ON "TempCorrectiveActionRule"("checkItemId", "correctiveActionTemplateId", "conditionType");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCorrectiveActionRule_programId_isActive_idx"
      ON "TempCorrectiveActionRule"("programId", "isActive");
    `);

    console.log("[ensure-temperature-programs-schema] Temperature program tables ready");
  } catch (err) {
    console.error("[ensure-temperature-programs-schema] Failed:", err);
  }
}
