import type { PrismaClient } from "@prisma/client";

/**
 * Recorded check-in audio is now kept for seven days so the creator can replay
 * it, which needs somewhere to track that window. Idempotent; runs at startup
 * because deploys have no migration step to lean on.
 */
export async function ensureCheckInAudioRetentionSchema(
  prisma: PrismaClient,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "public"."CheckInRecording"
        ADD COLUMN IF NOT EXISTS "audioStatus" TEXT NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS "audioCreatedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "audioExpiresAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "audioDeletedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "audioDeleteAttempts" INTEGER NOT NULL DEFAULT 0;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "CheckInRecording_audioStatus_audioExpiresAt_idx"
        ON "public"."CheckInRecording"("audioStatus", "audioExpiresAt");
    `);
    // Recordings made before this shipped had their audio deleted on
    // transcription, so they must not advertise a replay that cannot happen.
    await prisma.$executeRawUnsafe(`
      UPDATE "public"."CheckInRecording"
      SET "audioStatus" = 'deleted', "audioDeletedAt" = COALESCE("audioDeletedAt", "updatedAt")
      WHERE "audioStatus" = 'pending' AND "status" IN ('ready', 'failed');
    `);
    console.log("[startup] check-in audio retention schema ensured");
  } catch (err) {
    console.error("[startup] ensureCheckInAudioRetentionSchema failed:", err);
  }
}
