import type { PrismaClient } from "@prisma/client";

export async function ensureTeamHealthSnapshotSchema(prisma: PrismaClient) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."TeamHealthSnapshot" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "snapshotDate" TEXT NOT NULL,
        "timezone" TEXT NOT NULL,
        "teamHealthPct" INTEGER NOT NULL,
        "checkInPct" INTEGER,
        "goalsPct" INTEGER,
        "tasksPct" INTEGER NOT NULL,
        "memberCount" INTEGER NOT NULL,
        "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TeamHealthSnapshot_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "TeamHealthSnapshot_teamId_snapshotDate_key"
        ON public."TeamHealthSnapshot"("teamId", "snapshotDate");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TeamHealthSnapshot_teamId_capturedAt_idx"
        ON public."TeamHealthSnapshot"("teamId", "capturedAt");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."TeamHealthSnapshot"
          ADD CONSTRAINT "TeamHealthSnapshot_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES public."Team"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("[startup] team health snapshot table ensured");
    return { ok: true as const };
  } catch (err) {
    console.error("[startup] ensureTeamHealthSnapshotSchema failed:", err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
