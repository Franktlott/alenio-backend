import type { PrismaClient } from "@prisma/client";

/**
 * Idempotent runtime schema for account-level activity.
 *
 * Unlike the other ensure scripts this alters a constraint on a populated table,
 * so it only ever relaxes NOT NULL — existing rows keep their teamId untouched.
 */
export async function ensureAccountActivitySchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamActivity" ALTER COLUMN "teamId" DROP NOT NULL;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TeamActivity_userId_createdAt_idx" ON "TeamActivity"("userId", "createdAt");
  `);
}
