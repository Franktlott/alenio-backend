import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for connected recurring task series. */
export async function ensureRecurrenceSeriesSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RecurrenceSeries" (
      "id" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "creatorId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "priority" TEXT NOT NULL DEFAULT 'medium',
      "incognito" BOOLEAN NOT NULL DEFAULT false,
      "isJoint" BOOLEAN NOT NULL DEFAULT false,
      "attachmentUrl" TEXT,
      "type" TEXT NOT NULL,
      "interval" INTEGER NOT NULL DEFAULT 1,
      "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
      "daysOfWeek" TEXT,
      "dayOfMonth" INTEGER,
      "timeZone" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RecurrenceSeries_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RecurrenceSeries_teamId_idx" ON "RecurrenceSeries"("teamId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "RecurrenceSeries"
        ADD CONSTRAINT "RecurrenceSeries_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Task" ADD COLUMN "recurrenceSeriesId" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Task_recurrenceSeriesId_idx" ON "Task"("recurrenceSeriesId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "RecurrenceSeries" ADD COLUMN "timeZone" TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "RecurrenceSeries" ADD COLUMN "occurrenceCount" INTEGER NOT NULL DEFAULT 1;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Task"
        ADD CONSTRAINT "Task_recurrenceSeriesId_fkey"
        FOREIGN KEY ("recurrenceSeriesId") REFERENCES "RecurrenceSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}
