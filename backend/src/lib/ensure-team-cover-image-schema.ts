import type { PrismaClient } from "@prisma/client";

/** Adds Team.coverImage if missing (idempotent). */
export async function ensureTeamCoverImageSchema(
  prisma: PrismaClient,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "coverImage" TEXT
    `);
    console.log("[startup] team coverImage column ensured");
  } catch (err) {
    console.error("[startup] ensureTeamCoverImageSchema failed:", err);
  }
}
