import type { PrismaClient } from "@prisma/client";

export type EnsureActivityCommentsResult =
  | { ok: true }
  | { ok: false; error: string };

/** Creates the activity comment table if missing (idempotent). */
export async function ensureActivityCommentsSchema(
  prisma: PrismaClient,
): Promise<EnsureActivityCommentsResult> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."TeamActivityComment" (
        "id" TEXT NOT NULL,
        "activityId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TeamActivityComment_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TeamActivityComment_activityId_createdAt_idx"
        ON public."TeamActivityComment"("activityId", "createdAt");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."TeamActivityComment"
          ADD CONSTRAINT "TeamActivityComment_activityId_fkey"
          FOREIGN KEY ("activityId") REFERENCES public."TeamActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."TeamActivityComment"
          ADD CONSTRAINT "TeamActivityComment_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log("[startup] activity comments database table ensured");
    return { ok: true };
  } catch (err) {
    console.error("[startup] ensureActivityCommentsSchema failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
