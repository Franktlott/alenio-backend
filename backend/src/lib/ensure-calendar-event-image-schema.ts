import type { PrismaClient } from "@prisma/client";

/** Adds optional event photo column if missing (idempotent). */
export async function ensureCalendarEventImageSchema(
  prisma: PrismaClient,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "CalendarEvent"
          ADD COLUMN "image" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
  } catch (err) {
    console.error("[startup] ensureCalendarEventImageSchema failed:", err);
  }
}
