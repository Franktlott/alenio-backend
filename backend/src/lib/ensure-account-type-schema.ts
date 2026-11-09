import type { PrismaClient } from "@prisma/client";

/** Member vs platform-admin login. Existing rows stay members. */
export async function ensureAccountTypeSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE public."User" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'member';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
}
