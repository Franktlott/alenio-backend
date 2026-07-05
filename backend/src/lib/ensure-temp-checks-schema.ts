import type { PrismaClient } from "@prisma/client";

/** Creates temp check tables if missing (idempotent). */
export async function ensureTempChecksSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCheckTemplate" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "dueTimeLocal" TEXT NOT NULL,
        "windowStartLocal" TEXT NOT NULL,
        "windowEndLocal" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "isPublished" BOOLEAN NOT NULL DEFAULT false,
        "createdByUserId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempCheckTemplate_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckTemplate_teamId_isActive_idx"
      ON "TempCheckTemplate"("teamId", "isActive");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCheckTemplateItem" (
        "id" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "tempMinF" DOUBLE PRECISION,
        "tempMaxF" DOUBLE PRECISION,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "TempCheckTemplateItem_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckTemplateItem_templateId_idx"
      ON "TempCheckTemplateItem"("templateId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCheckCorrectiveAction" (
        "id" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "itemId" TEXT,
        "label" TEXT NOT NULL,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "TempCheckCorrectiveAction_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckCorrectiveAction_templateId_idx"
      ON "TempCheckCorrectiveAction"("templateId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckCorrectiveAction_itemId_idx"
      ON "TempCheckCorrectiveAction"("itemId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckTemplate"
          ADD CONSTRAINT "TempCheckTemplate_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckTemplateItem"
          ADD CONSTRAINT "TempCheckTemplateItem_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "TempCheckTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckCorrectiveAction"
          ADD CONSTRAINT "TempCheckCorrectiveAction_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "TempCheckTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckCorrectiveAction"
          ADD CONSTRAINT "TempCheckCorrectiveAction_itemId_fkey"
          FOREIGN KEY ("itemId") REFERENCES "TempCheckTemplateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckTemplate" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
        UPDATE "TempCheckTemplate" SET "isPublished" = true;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCheckCompletion" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "checkName" TEXT NOT NULL,
        "dueTimeLocal" TEXT NOT NULL,
        "windowStartLocal" TEXT NOT NULL,
        "windowEndLocal" TEXT NOT NULL,
        "completedByUserId" TEXT NOT NULL,
        "completedByName" TEXT NOT NULL,
        "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deviceId" TEXT,
        "totalItems" INTEGER NOT NULL,
        "inRangeCount" INTEGER NOT NULL,
        "outOfRangeCount" INTEGER NOT NULL,
        "readings" JSONB NOT NULL,
        CONSTRAINT "TempCheckCompletion_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckCompletion_teamId_completedAt_idx"
      ON "TempCheckCompletion"("teamId", "completedAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckCompletion_templateId_completedAt_idx"
      ON "TempCheckCompletion"("templateId", "completedAt");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckCompletion"
          ADD CONSTRAINT "TempCheckCompletion_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckCompletion"
          ADD CONSTRAINT "TempCheckCompletion_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "TempCheckTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCheckEquipment" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "tempMinF" DOUBLE PRECISION,
        "tempMaxF" DOUBLE PRECISION,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TempCheckEquipment_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckEquipment_teamId_isActive_idx"
      ON "TempCheckEquipment"("teamId", "isActive");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TempCheckEquipmentCorrectiveAction" (
        "id" TEXT NOT NULL,
        "equipmentId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "TempCheckEquipmentCorrectiveAction_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckEquipmentCorrectiveAction_equipmentId_idx"
      ON "TempCheckEquipmentCorrectiveAction"("equipmentId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckEquipment"
          ADD CONSTRAINT "TempCheckEquipment_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckEquipmentCorrectiveAction"
          ADD CONSTRAINT "TempCheckEquipmentCorrectiveAction_equipmentId_fkey"
          FOREIGN KEY ("equipmentId") REFERENCES "TempCheckEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckTemplateItem" ADD COLUMN "equipmentId" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TempCheckTemplateItem"
          ADD CONSTRAINT "TempCheckTemplateItem_equipmentId_fkey"
          FOREIGN KEY ("equipmentId") REFERENCES "TempCheckEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TempCheckTemplateItem_equipmentId_idx"
      ON "TempCheckTemplateItem"("equipmentId");
    `);
    console.log("[startup] Temp check schema ensured");
  } catch (err) {
    console.error("[startup] ensureTempChecksSchema failed:", err);
  }
}
