import type { PrismaClient } from "@prisma/client";

/** Creates Alenio Go tables if missing (idempotent). */
export async function ensureAlenioGoSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GoLocation" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "area" TEXT,
        "goCode" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "guestEnabled" BOOLEAN NOT NULL DEFAULT true,
        "createdById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GoLocation_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "GoLocation_goCode_key" ON "GoLocation"("goCode");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GoLocation_teamId_idx" ON "GoLocation"("teamId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GoLocationChecklist" (
        "id" TEXT NOT NULL,
        "goLocationId" TEXT NOT NULL,
        "checklistLocationId" TEXT NOT NULL,
        "dueTime" TEXT,
        "shift" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GoLocationChecklist_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "GoLocationChecklist_goLocationId_checklistLocationId_key"
        ON "GoLocationChecklist"("goLocationId", "checklistLocationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GoLocationChecklist_goLocationId_idx" ON "GoLocationChecklist"("goLocationId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GoLocationChecklist_checklistLocationId_idx" ON "GoLocationChecklist"("checklistLocationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GoSession" (
        "id" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "goLocationId" TEXT NOT NULL,
        "displayName" TEXT NOT NULL,
        "deviceLabel" TEXT,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "GoSession_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "GoSession_token_key" ON "GoSession"("token");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GoSession_goLocationId_startedAt_idx" ON "GoSession"("goLocationId", "startedAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GoSession_expiresAt_idx" ON "GoSession"("expiresAt");
    `);

    for (const fk of [
      `ALTER TABLE "GoLocation" ADD CONSTRAINT "GoLocation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "GoLocation" ADD CONSTRAINT "GoLocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      `ALTER TABLE "GoLocationChecklist" ADD CONSTRAINT "GoLocationChecklist_goLocationId_fkey" FOREIGN KEY ("goLocationId") REFERENCES "GoLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "GoLocationChecklist" ADD CONSTRAINT "GoLocationChecklist_checklistLocationId_fkey" FOREIGN KEY ("checklistLocationId") REFERENCES "ChecklistLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "GoSession" ADD CONSTRAINT "GoSession_goLocationId_fkey" FOREIGN KEY ("goLocationId") REFERENCES "GoLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    ]) {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ${fk};
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }
  } catch (err) {
    console.error("[startup] ensureAlenioGoSchema failed:", err);
  }
}
