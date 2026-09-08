import type { PrismaClient } from "@prisma/client";
import { isValidTimeZone } from "./timezone";

type TeamOwnerTimeZoneRow = {
  teamId: string;
  timezone: string | null;
};

/**
 * Additive, idempotent rollout for Team.timezone.
 * Existing null workspaces inherit a valid owner's preference when one exists;
 * unresolved rows intentionally remain null so runtime fallback semantics apply.
 */
export async function ensureTeamTimezoneSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "timezone" TEXT
  `);

  const rows = await prisma.$queryRawUnsafe<TeamOwnerTimeZoneRow[]>(`
    SELECT DISTINCT ON (tm."teamId")
      tm."teamId" AS "teamId",
      u."timezone" AS "timezone"
    FROM "TeamMember" tm
    JOIN "User" u ON u."id" = tm."userId"
    JOIN "Team" t ON t."id" = tm."teamId"
    WHERE t."timezone" IS NULL
      AND tm."role" = 'owner'
    ORDER BY tm."teamId", tm."joinedAt" ASC, tm."id" ASC
  `);

  for (const row of rows) {
    const timezone = row.timezone?.trim();
    if (!timezone || !isValidTimeZone(timezone)) continue;
    await prisma.$executeRaw`
      UPDATE "Team"
      SET "timezone" = ${timezone}
      WHERE "id" = ${row.teamId}
        AND "timezone" IS NULL
    `;
  }
}
