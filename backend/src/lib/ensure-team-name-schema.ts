import type { PrismaClient } from "@prisma/client";

/**
 * Workspace names are unique per person, not across all of Alenio.
 * Drops the old global unique index; idempotent.
 */
export async function ensureTeamNameSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`ALTER TABLE "Team" DROP CONSTRAINT IF EXISTS "Team_name_key"`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Team_name_key"`);
}
