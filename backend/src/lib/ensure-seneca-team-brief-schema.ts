import type { PrismaClient } from "@prisma/client";

export async function ensureSenecaTeamBriefSchema(prisma: PrismaClient) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."SenecaTeamBrief" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "generatedForUserId" TEXT NOT NULL,
        "localDate" TEXT NOT NULL,
        "timezone" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "impact" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'generated',
        "score" DOUBLE PRECISION NOT NULL,
        "confidence" DOUBLE PRECISION NOT NULL,
        "estimatedMinutes" INTEGER NOT NULL,
        "affectedCount" INTEGER NOT NULL,
        "affectedMemberIds" JSONB NOT NULL DEFAULT '[]',
        "candidateJson" JSONB NOT NULL,
        "candidatesJson" JSONB NOT NULL,
        "sourceMetricsJson" JSONB NOT NULL,
        "materialFingerprint" TEXT NOT NULL,
        "copyJson" JSONB NOT NULL,
        "copySource" TEXT NOT NULL DEFAULT 'deterministic',
        "projectedHealthPct" INTEGER,
        "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "completedAt" TIMESTAMP(3),
        "completedByUserId" TEXT,
        "refreshAvailableAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SenecaTeamBrief_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."SenecaTeamBriefEvent" (
        "id" TEXT NOT NULL,
        "briefId" TEXT,
        "teamId" TEXT NOT NULL,
        "actorUserId" TEXT,
        "type" TEXT NOT NULL,
        "metadata" JSONB NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SenecaTeamBriefEvent_pkey" PRIMARY KEY ("id")
      );
    `);

    const statements = [
      `CREATE INDEX IF NOT EXISTS "SenecaTeamBrief_teamId_generatedForUserId_localDate_status_idx" ON public."SenecaTeamBrief"("teamId","generatedForUserId","localDate","status")`,
      `CREATE INDEX IF NOT EXISTS "SenecaTeamBrief_teamId_materialFingerprint_idx" ON public."SenecaTeamBrief"("teamId","materialFingerprint")`,
      `CREATE INDEX IF NOT EXISTS "SenecaTeamBrief_expiresAt_idx" ON public."SenecaTeamBrief"("expiresAt")`,
      `CREATE INDEX IF NOT EXISTS "SenecaTeamBriefEvent_briefId_createdAt_idx" ON public."SenecaTeamBriefEvent"("briefId","createdAt")`,
      `CREATE INDEX IF NOT EXISTS "SenecaTeamBriefEvent_teamId_type_createdAt_idx" ON public."SenecaTeamBriefEvent"("teamId","type","createdAt")`,
      `CREATE INDEX IF NOT EXISTS "SenecaTeamBriefEvent_actorUserId_createdAt_idx" ON public."SenecaTeamBriefEvent"("actorUserId","createdAt")`,
    ];
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);

    const constraints = [
      `ALTER TABLE public."SenecaTeamBrief" ADD CONSTRAINT "SenecaTeamBrief_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE public."SenecaTeamBrief" ADD CONSTRAINT "SenecaTeamBrief_generatedForUserId_fkey" FOREIGN KEY ("generatedForUserId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE public."SenecaTeamBriefEvent" ADD CONSTRAINT "SenecaTeamBriefEvent_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES public."SenecaTeamBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      `ALTER TABLE public."SenecaTeamBriefEvent" ADD CONSTRAINT "SenecaTeamBriefEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE public."SenecaTeamBriefEvent" ADD CONSTRAINT "SenecaTeamBriefEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    ];
    for (const statement of constraints) {
      await prisma.$executeRawUnsafe(`DO $$ BEGIN ${statement}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    }
    console.log("[startup] Seneca team brief tables ensured");
    return { ok: true as const };
  } catch (err) {
    console.error("[startup] ensureSenecaTeamBriefSchema failed:", err);
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
