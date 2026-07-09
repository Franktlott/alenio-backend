import type { PrismaClient } from "@prisma/client";

/** Adds 1:1 planning columns on CalendarEvent if missing (idempotent). */
export async function ensureCalendarOneOnOneSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "CalendarEvent"
          ADD COLUMN "isOneOnOne" BOOLEAN NOT NULL DEFAULT false;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "CalendarEvent"
          ADD COLUMN "oneOnOneMemberUserId" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "CalendarEvent"
          ADD COLUMN "oneOnOneTemplateId" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "CalendarEvent"
      SET "isOneOnOne" = true
      WHERE "title" LIKE '1:1 —%'
        AND COALESCE("isOneOnOne", false) = false;
    `);
  } catch (err) {
    console.error("[startup] ensureCalendarOneOnOneSchema failed:", err);
  }
}
