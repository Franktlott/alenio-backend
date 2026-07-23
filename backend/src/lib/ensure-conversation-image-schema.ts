import type { PrismaClient } from "@prisma/client";

/** Idempotent: add Conversation.image for group photos. */
export async function ensureConversationImageSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Conversation"
    ADD COLUMN IF NOT EXISTS "image" TEXT;
  `);
}
