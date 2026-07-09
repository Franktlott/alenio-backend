import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for workspace linkage on group conversations. */
export async function ensureConversationTeamSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Conversation" ADD COLUMN "teamId" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Conversation_teamId_idx" ON "Conversation"("teamId");
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Conversation"
        ADD CONSTRAINT "Conversation_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}
