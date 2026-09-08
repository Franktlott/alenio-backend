import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for account-level active presence. */
export async function ensurePresenceSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "showActiveStatus" BOOLEAN NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
}
