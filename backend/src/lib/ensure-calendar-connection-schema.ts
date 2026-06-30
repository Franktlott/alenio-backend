import type { PrismaClient } from "@prisma/client";

/** Outlook / external calendar connection tables (idempotent). */
export async function ensureCalendarConnectionSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CalendarConnection" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "accountEmail" TEXT,
        "externalCalendarId" TEXT,
        "externalCalendarName" TEXT,
        "accessTokenEnc" TEXT,
        "refreshTokenEnc" TEXT NOT NULL,
        "accessTokenExpiresAt" TIMESTAMP(3),
        "lastSyncedAt" TIMESTAMP(3),
        "syncError" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "CalendarConnection_userId_provider_key"
      ON "CalendarConnection"("userId", "provider");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "CalendarConnection_userId_idx"
      ON "CalendarConnection"("userId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "CalendarConnection"
          ADD CONSTRAINT "CalendarConnection_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ExternalCalendarEvent" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "connectionId" TEXT NOT NULL,
        "externalEventId" TEXT NOT NULL,
        "startDate" TIMESTAMP(3) NOT NULL,
        "endDate" TIMESTAMP(3),
        "allDay" BOOLEAN NOT NULL DEFAULT false,
        "titleDisplay" TEXT NOT NULL DEFAULT 'Busy',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ExternalCalendarEvent_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ExternalCalendarEvent_connectionId_externalEventId_key"
      ON "ExternalCalendarEvent"("connectionId", "externalEventId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ExternalCalendarEvent_userId_startDate_idx"
      ON "ExternalCalendarEvent"("userId", "startDate");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "ExternalCalendarEvent"
          ADD CONSTRAINT "ExternalCalendarEvent_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "ExternalCalendarEvent"
          ADD CONSTRAINT "ExternalCalendarEvent_connectionId_fkey"
          FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("[startup] calendar connection schema ensured");
  } catch (err) {
    console.error("[startup] ensureCalendarConnectionSchema failed:", err);
  }
}
