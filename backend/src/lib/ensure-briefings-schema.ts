import type { PrismaClient } from "@prisma/client";

/** Creates briefing tables if missing (idempotent). */
export async function ensureBriefingsSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Briefing" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "documentUrl" TEXT NOT NULL,
        "documentFilename" TEXT,
        "contentType" TEXT,
        "dueAt" TIMESTAMP(3),
        "requireSignature" BOOLEAN NOT NULL DEFAULT false,
        "allowInitials" BOOLEAN NOT NULL DEFAULT true,
        "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdByUserId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Briefing_teamId_publishedAt_idx"
      ON "Briefing"("teamId", "publishedAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BriefingCompletion" (
        "id" TEXT NOT NULL,
        "briefingId" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "completionKey" TEXT NOT NULL,
        "userId" TEXT,
        "deviceId" TEXT,
        "reviewerName" TEXT,
        "initials" TEXT NOT NULL,
        "signatureData" TEXT,
        "documentUrl" TEXT NOT NULL,
        "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BriefingCompletion_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "BriefingCompletion_briefingId_completionKey_key"
      ON "BriefingCompletion"("briefingId", "completionKey");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "BriefingCompletion_teamId_completedAt_idx"
      ON "BriefingCompletion"("teamId", "completedAt");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Briefing"
          ADD CONSTRAINT "Briefing_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "BriefingCompletion"
          ADD CONSTRAINT "BriefingCompletion_briefingId_fkey"
          FOREIGN KEY ("briefingId") REFERENCES "Briefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("[startup] Briefing schema ensured");
  } catch (err) {
    console.error("[startup] ensureBriefingsSchema failed:", err);
  }
}
