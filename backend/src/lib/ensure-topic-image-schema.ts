import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for optional Space photo URLs. */
export async function ensureTopicImageSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Topic" ADD COLUMN "image" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
}
