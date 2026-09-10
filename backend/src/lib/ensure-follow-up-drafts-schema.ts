import type { PrismaClient } from "@prisma/client";

/**
 * Follow-up tasks can now be jotted down while a check-in is still a draft, so
 * a draft needs somewhere to hold them that is not the Task table. Idempotent;
 * runs at startup because deploys have no migration step to lean on.
 */
export async function ensureFollowUpDraftsSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."OneOnOneMeeting"
        ADD COLUMN IF NOT EXISTS "followUpDraftsJson" TEXT;
    `);
    console.log("[startup] follow-up drafts schema ensured");
  } catch (err) {
    console.error("[startup] ensureFollowUpDraftsSchema failed:", err);
  }
}
