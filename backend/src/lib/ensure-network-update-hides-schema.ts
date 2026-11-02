import type { PrismaClient } from "@prisma/client";

export type EnsureNetworkUpdateHidesResult =
  | { ok: true }
  | { ok: false; error: string };

/** Creates per-viewer network update hides if missing (idempotent). */
export async function ensureNetworkUpdateHidesSchema(
  prisma: PrismaClient,
): Promise<EnsureNetworkUpdateHidesResult> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."NetworkUpdateHide" (
        "id" TEXT NOT NULL,
        "viewerId" TEXT NOT NULL,
        "activityId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "NetworkUpdateHide_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "NetworkUpdateHide_viewerId_activityId_key"
        ON public."NetworkUpdateHide"("viewerId", "activityId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "NetworkUpdateHide_activityId_idx"
        ON public."NetworkUpdateHide"("activityId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."NetworkUpdateHide"
          ADD CONSTRAINT "NetworkUpdateHide_viewerId_fkey"
          FOREIGN KEY ("viewerId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."NetworkUpdateHide"
          ADD CONSTRAINT "NetworkUpdateHide_activityId_fkey"
          FOREIGN KEY ("activityId") REFERENCES public."TeamActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log("[startup] network update hides database table ensured");
    return { ok: true };
  } catch (err) {
    console.error("[startup] ensureNetworkUpdateHidesSchema failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
