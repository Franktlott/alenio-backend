import type { PrismaClient } from "@prisma/client";

/**
 * Idempotent runtime schema for notification preference columns on User.
 * Safe no-op when columns already exist (Railway preDeploy may have missed them).
 * Does not touch pushToken or push delivery.
 */
export async function ensureNotificationPreferencesSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "notifMessages" BOOLEAN NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "notifTaskAssigned" BOOLEAN NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "notifTaskDue" BOOLEAN NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "notifMeetings" BOOLEAN NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "notifAdminUsers" BOOLEAN NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "notifAdminWorkspaces" BOOLEAN NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "notifAdminBilling" BOOLEAN NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "notifTone" TEXT NOT NULL DEFAULT 'default';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
}
