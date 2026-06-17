import type { PrismaClient } from "@prisma/client";

/** Adds calendar approval column if missing (idempotent). */
export async function ensureCalendarApprovalSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "CalendarEvent"
          ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'approved';
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
  } catch (err) {
    console.error("[startup] ensureCalendarApprovalSchema failed:", err);
  }
}
