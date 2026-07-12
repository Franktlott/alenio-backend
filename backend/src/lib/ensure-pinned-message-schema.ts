import type { PrismaClient } from "@prisma/client";

const MAX_PINS = 5;

/** Idempotent tables for up to 5 pinned messages per channel / DM. */
export async function ensurePinnedMessageSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TeamChatPin" (
      "id" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "channelKey" TEXT NOT NULL,
      "messageId" TEXT NOT NULL,
      "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "pinnedById" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "TeamChatPin_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TeamChatPin_teamId_channelKey_messageId_key"
      ON "TeamChatPin"("teamId", "channelKey", "messageId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TeamChatPin_teamId_channelKey_sortOrder_idx"
      ON "TeamChatPin"("teamId", "channelKey", "sortOrder");
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamChatPin"
        ADD CONSTRAINT "TeamChatPin_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamChatPin"
        ADD CONSTRAINT "TeamChatPin_messageId_fkey"
        FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamChatPin"
        ADD CONSTRAINT "TeamChatPin_pinnedById_fkey"
        FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ConversationPin" (
      "id" TEXT NOT NULL,
      "conversationId" TEXT NOT NULL,
      "directMessageId" TEXT NOT NULL,
      "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "pinnedById" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "ConversationPin_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ConversationPin_conversationId_directMessageId_key"
      ON "ConversationPin"("conversationId", "directMessageId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ConversationPin_conversationId_sortOrder_idx"
      ON "ConversationPin"("conversationId", "sortOrder");
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ConversationPin"
        ADD CONSTRAINT "ConversationPin_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ConversationPin"
        ADD CONSTRAINT "ConversationPin_directMessageId_fkey"
        FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ConversationPin"
        ADD CONSTRAINT "ConversationPin_pinnedById_fkey"
        FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Migrate legacy single-pin columns if they still exist.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Team' AND column_name = 'pinnedMessageId'
      ) THEN
        INSERT INTO "TeamChatPin" ("id", "teamId", "channelKey", "messageId", "pinnedAt", "pinnedById", "sortOrder")
        SELECT
          md5(random()::text || clock_timestamp()::text),
          t."id",
          'general',
          t."pinnedMessageId",
          COALESCE(t."pinnedAt", CURRENT_TIMESTAMP),
          COALESCE(t."pinnedById", (SELECT "id" FROM "User" LIMIT 1)),
          0
        FROM "Team" t
        WHERE t."pinnedMessageId" IS NOT NULL
          AND t."pinnedById" IS NOT NULL
        ON CONFLICT ("teamId", "channelKey", "messageId") DO NOTHING;
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Topic' AND column_name = 'pinnedMessageId'
      ) THEN
        INSERT INTO "TeamChatPin" ("id", "teamId", "channelKey", "messageId", "pinnedAt", "pinnedById", "sortOrder")
        SELECT
          md5(random()::text || clock_timestamp()::text),
          tp."teamId",
          tp."id",
          tp."pinnedMessageId",
          COALESCE(tp."pinnedAt", CURRENT_TIMESTAMP),
          COALESCE(tp."pinnedById", (SELECT "id" FROM "User" LIMIT 1)),
          0
        FROM "Topic" tp
        WHERE tp."pinnedMessageId" IS NOT NULL
          AND tp."pinnedById" IS NOT NULL
        ON CONFLICT ("teamId", "channelKey", "messageId") DO NOTHING;
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Conversation' AND column_name = 'pinnedDirectMessageId'
      ) THEN
        INSERT INTO "ConversationPin" ("id", "conversationId", "directMessageId", "pinnedAt", "pinnedById", "sortOrder")
        SELECT
          md5(random()::text || clock_timestamp()::text),
          c."id",
          c."pinnedDirectMessageId",
          COALESCE(c."pinnedAt", CURRENT_TIMESTAMP),
          COALESCE(c."pinnedById", (SELECT "id" FROM "User" LIMIT 1)),
          0
        FROM "Conversation" c
        WHERE c."pinnedDirectMessageId" IS NOT NULL
          AND c."pinnedById" IS NOT NULL
        ON CONFLICT ("conversationId", "directMessageId") DO NOTHING;
      END IF;
    END $$;
  `);
}

export { MAX_PINS as MAX_CHAT_PINS };
