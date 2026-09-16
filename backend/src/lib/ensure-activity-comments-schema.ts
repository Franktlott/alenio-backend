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

    // Replies: a comment may point at the comment it answers.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE public."TeamActivityComment"
        ADD COLUMN IF NOT EXISTS "parentId" TEXT;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TeamActivityComment_parentId_createdAt_idx"
        ON public."TeamActivityComment"("parentId", "createdAt");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."TeamActivityComment"
          ADD CONSTRAINT "TeamActivityComment_parentId_fkey"
          FOREIGN KEY ("parentId") REFERENCES public."TeamActivityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Reactions on comments, mirroring TeamActivityReaction.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."TeamActivityCommentReaction" (
        "id" TEXT NOT NULL,
        "emoji" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "commentId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TeamActivityCommentReaction_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "TeamActivityCommentReaction_commentId_userId_emoji_key"
        ON public."TeamActivityCommentReaction"("commentId", "userId", "emoji");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."TeamActivityCommentReaction"
          ADD CONSTRAINT "TeamActivityCommentReaction_commentId_fkey"
          FOREIGN KEY ("commentId") REFERENCES public."TeamActivityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."TeamActivityCommentReaction"
          ADD CONSTRAINT "TeamActivityCommentReaction_userId_fkey"
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
