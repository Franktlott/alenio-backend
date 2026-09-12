import type { PrismaClient } from "@prisma/client";

/** Adds optional event photo column if missing (idempotent). */
export async function ensureCalendarEventImageSchema(
  prisma: PrismaClient,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE public."CalendarEvent"
        ADD COLUMN IF NOT EXISTS "image" TEXT
    `);
  } catch (err) {
    console.error("[startup] ensureCalendarEventImageSchema failed:", err);
  }
}
