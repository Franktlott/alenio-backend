import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for task archive support. */
export async function ensureTaskArchiveSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Task" ADD COLUMN "archivedAt" TIMESTAMP(3);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Task_teamId_archivedAt_idx" ON "Task"("teamId", "archivedAt");
  `);
}
