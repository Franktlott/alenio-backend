import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for group participant roles (owner / admin / member). */
export async function ensureGroupParticipantRolesSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ConversationParticipantRole" AS ENUM ('owner', 'admin', 'member');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "ConversationParticipant"
        ADD COLUMN "role" "ConversationParticipantRole" NOT NULL DEFAULT 'member';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  // Existing groups: promote the earliest participant to owner when none is set.
  await prisma.$executeRawUnsafe(`
    WITH groups_missing_owner AS (
      SELECT c.id AS "conversationId"
      FROM "Conversation" c
      WHERE c."isGroup" = true
        AND NOT EXISTS (
          SELECT 1
          FROM "ConversationParticipant" cp
          WHERE cp."conversationId" = c.id AND cp.role = 'owner'
        )
    ),
    first_participant AS (
      SELECT DISTINCT ON (cp."conversationId") cp.id
      FROM "ConversationParticipant" cp
      INNER JOIN groups_missing_owner g ON g."conversationId" = cp."conversationId"
      ORDER BY cp."conversationId", cp.id ASC
    )
    UPDATE "ConversationParticipant" cp
    SET role = 'owner'
    FROM first_participant fp
    WHERE cp.id = fp.id;
  `);
}
