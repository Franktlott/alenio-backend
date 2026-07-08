import type { PrismaClient } from "@prisma/client";

/** Creates workspace module + module test session tables if missing (idempotent). */
export async function ensureWorkspaceModulesSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WorkspaceModule" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "companyId" TEXT,
        "moduleKey" TEXT NOT NULL,
        "moduleName" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'inactive',
        "operatingMode" TEXT,
        "setupProgressPercent" INTEGER NOT NULL DEFAULT 0,
        "setupCompletedAt" TIMESTAMP(3),
        "activatedAt" TIMESTAMP(3),
        "activatedByUserId" TEXT,
        "liveStartedAt" TIMESTAMP(3),
        "liveStartedByUserId" TEXT,
        "testingStartedAt" TIMESTAMP(3),
        "testingStartedByUserId" TEXT,
        "requireTestCode" BOOLEAN NOT NULL DEFAULT false,
        "testAccessCode" TEXT,
        "testCodeExpiresAt" TIMESTAMP(3),
        "allowedTestingWorkplaceIds" TEXT,
        "allowedTestingUserIds" TEXT,
        "allowedTestingRoles" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WorkspaceModule_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceModule_teamId_moduleKey_key"
      ON "WorkspaceModule"("teamId", "moduleKey");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WorkspaceModule_teamId_idx"
      ON "WorkspaceModule"("teamId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WorkspaceModule"
          ADD CONSTRAINT "WorkspaceModule_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ModuleTestSession" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "moduleKey" TEXT NOT NULL,
        "testedByUserId" TEXT,
        "testerName" TEXT,
        "workplaceId" TEXT,
        "workplaceName" TEXT,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP(3),
        "durationSeconds" INTEGER,
        "completedSteps" INTEGER NOT NULL DEFAULT 0,
        "failedSteps" INTEGER NOT NULL DEFAULT 0,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ModuleTestSession_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ModuleTestSession_teamId_moduleKey_idx"
      ON "ModuleTestSession"("teamId", "moduleKey");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "ModuleTestSession"
          ADD CONSTRAINT "ModuleTestSession_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("[startup] WorkspaceModule schema ensured");
  } catch (err) {
    console.error("[startup] ensureWorkspaceModulesSchema failed:", err);
  }
}
