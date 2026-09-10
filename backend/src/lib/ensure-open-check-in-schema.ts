import type { PrismaClient } from "@prisma/client";

/**
 * Open check-ins record without a template, so a recording no longer always has
 * a templateId. Idempotent; runs at startup because deploys have no migration
 * step to lean on.
 */
export async function ensureOpenCheckInSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."CheckInRecording"
        ALTER COLUMN "templateId" DROP NOT NULL;
    `);
    console.log("[startup] open check-in schema ensured");
  } catch (err) {
    console.error("[startup] ensureOpenCheckInSchema failed:", err);
  }
}
