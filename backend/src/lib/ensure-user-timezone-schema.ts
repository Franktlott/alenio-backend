import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for per-user IANA timezone preference. */
export async function ensureUserTimezoneSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "timezone" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
}
