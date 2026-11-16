import type { PrismaClient } from "@prisma/client";

export type EnsureActivityAudienceResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Adds TeamActivity audience columns and backfills legacy rows (idempotent).
 */
export async function ensureActivityAudienceSchema(
  prisma: PrismaClient,
): Promise<EnsureActivityAudienceResult> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE public."TeamActivity"
        ADD COLUMN IF NOT EXISTS "audienceKind" TEXT,
        ADD COLUMN IF NOT EXISTS "audienceTeamId" TEXT;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TeamActivity_audienceKind_createdAt_idx"
        ON public."TeamActivity"("audienceKind", "createdAt");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TeamActivity_audienceTeamId_createdAt_idx"
        ON public."TeamActivity"("audienceTeamId", "createdAt");
    `);

    // Legacy network posts.
    await prisma.$executeRawUnsafe(`
      UPDATE public."TeamActivity"
      SET "audienceKind" = 'network', "audienceTeamId" = NULL
      WHERE "audienceKind" IS NULL
        AND "type" = 'network_post';
    `);

    // Legacy team-scoped feed rows.
    await prisma.$executeRawUnsafe(`
      UPDATE public."TeamActivity"
      SET "audienceKind" = 'workspace', "audienceTeamId" = "teamId"
      WHERE "audienceKind" IS NULL
        AND "teamId" IS NOT NULL;
    `);

    // Remaining account-level rows (personal recognition, etc.).
    await prisma.$executeRawUnsafe(`
      UPDATE public."TeamActivity"
      SET "audienceKind" = 'self', "audienceTeamId" = NULL
      WHERE "audienceKind" IS NULL;
    `);

    console.log("[startup] TeamActivity audience columns ensured");
    return { ok: true };
  } catch (err) {
    console.error("[startup] ensureActivityAudienceSchema failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
