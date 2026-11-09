import type { PrismaClient } from "@prisma/client";

/** Staff roles and the staff activity log. Existing staff keep full access (null role). */
export async function ensureStaffRolesSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE public."User" ADD COLUMN "staffRole" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."StaffAuditLog" (
      "id" TEXT PRIMARY KEY,
      "actorId" TEXT NOT NULL,
      "actorEmail" TEXT,
      "action" TEXT NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT,
      "summary" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "StaffAuditLog_createdAt_idx" ON public."StaffAuditLog" ("createdAt");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "StaffAuditLog_targetType_targetId_idx" ON public."StaffAuditLog" ("targetType", "targetId");`,
  );
}
