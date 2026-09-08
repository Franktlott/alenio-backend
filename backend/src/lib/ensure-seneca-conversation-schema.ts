import type { PrismaClient } from "@prisma/client";

export async function ensureSenecaConversationSchema(prisma: PrismaClient) {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."SenecaConversation" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "teamId" TEXT,
        "contextType" TEXT NOT NULL,
        "capabilityMode" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "preview" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "SenecaConversation_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."SenecaConversationMessage" (
        "id" TEXT NOT NULL,
        "conversationId" TEXT NOT NULL,
        "order" INTEGER NOT NULL,
        "role" TEXT NOT NULL,
        "text" TEXT NOT NULL,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SenecaConversationMessage_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE public."SenecaGeneration"
      ADD COLUMN IF NOT EXISTS "conversationId" TEXT
    `);

    const statements = [
      `CREATE INDEX IF NOT EXISTS "SenecaConversation_userId_contextType_updatedAt_idx" ON public."SenecaConversation"("userId","contextType","updatedAt")`,
      `CREATE INDEX IF NOT EXISTS "SenecaConversation_userId_teamId_updatedAt_idx" ON public."SenecaConversation"("userId","teamId","updatedAt")`,
      `CREATE INDEX IF NOT EXISTS "SenecaConversation_expiresAt_idx" ON public."SenecaConversation"("expiresAt")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "SenecaConversationMessage_conversationId_order_key" ON public."SenecaConversationMessage"("conversationId","order")`,
      `CREATE INDEX IF NOT EXISTS "SenecaConversationMessage_conversationId_createdAt_idx" ON public."SenecaConversationMessage"("conversationId","createdAt")`,
      `CREATE INDEX IF NOT EXISTS "SenecaGeneration_conversationId_idx" ON public."SenecaGeneration"("conversationId")`,
    ];
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);

    const constraints = [
      `ALTER TABLE public."SenecaConversation" ADD CONSTRAINT "SenecaConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE public."SenecaConversation" ADD CONSTRAINT "SenecaConversation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE public."SenecaConversationMessage" ADD CONSTRAINT "SenecaConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."SenecaConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE public."SenecaGeneration" ADD CONSTRAINT "SenecaGeneration_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."SenecaConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    ];
    for (const statement of constraints) {
      await prisma.$executeRawUnsafe(
        `DO $$ BEGIN ${statement}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      );
    }
    console.log("[startup] Seneca conversation tables ensured");
    return { ok: true as const };
  } catch (error) {
    console.error("[startup] ensureSenecaConversationSchema failed:", error);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
