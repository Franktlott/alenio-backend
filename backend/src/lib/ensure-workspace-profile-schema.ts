import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for editable workspace profile fields. */
export async function ensureWorkspaceProfileSchema(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Team" ADD COLUMN "location" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
}
