import type { PrismaClient } from "@prisma/client";

/** Creates walk tables if missing (idempotent). */
export async function ensureWalksSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalkTemplate" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "workplace" TEXT NOT NULL,
        "scoringEnabled" BOOLEAN NOT NULL DEFAULT true,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
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
      CREATE TABLE IF NOT EXISTS "WalkTemplateItem" (
        "id" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "WalkTemplateItem_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkTemplateItem_templateId_idx"
      ON "WalkTemplateItem"("templateId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WalkCompletion" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "walkName" TEXT NOT NULL,
        "workplace" TEXT NOT NULL,
        "completedByUserId" TEXT NOT NULL,
        "completedByName" TEXT NOT NULL,
        "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "scoringEnabled" BOOLEAN NOT NULL DEFAULT true,
        "score" INTEGER,
        "totalReviewed" INTEGER NOT NULL,
        "passCount" INTEGER NOT NULL,
        "needsAttentionCount" INTEGER NOT NULL,
        "naCount" INTEGER NOT NULL,
        "photosCount" INTEGER NOT NULL DEFAULT 0,
        "finalNotes" TEXT,
        "responses" JSONB NOT NULL,
        CONSTRAINT "WalkCompletion_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkCompletion_teamId_completedAt_idx"
      ON "WalkCompletion"("teamId", "completedAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkCompletion_templateId_completedAt_idx"
      ON "WalkCompletion"("templateId", "completedAt");
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
        ALTER TABLE "WalkTemplateItem"
          ADD CONSTRAINT "WalkTemplateItem_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "WalkTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkCompletion"
          ADD CONSTRAINT "WalkCompletion_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WalkCompletion"
          ADD CONSTRAINT "WalkCompletion_templateId_fkey"
          FOREIGN KEY ("templateId") REFERENCES "WalkTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("[startup] Walk schema ensured");
  } catch (err) {
    console.error("[startup] ensureWalksSchema failed:", err);
  }
}
