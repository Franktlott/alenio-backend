import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for DM uniqueness on Conversation. */
export async function ensureDmPairKeySchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Conversation" ADD COLUMN "dmPairKey" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_dmPairKey_key" ON "Conversation"("dmPairKey");
  `);
}
