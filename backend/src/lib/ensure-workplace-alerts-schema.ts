import type { PrismaClient } from "@prisma/client";

/** Creates workplace alert tables if missing (idempotent). */
export async function ensureWorkplaceAlertsSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WorkplaceAlert" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "targetType" TEXT NOT NULL,
        "targetDeviceId" TEXT,
        "playSound" BOOLEAN NOT NULL DEFAULT true,
        "createdByUserId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WorkplaceAlert_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WorkplaceAlert_teamId_createdAt_idx"
      ON "WorkplaceAlert"("teamId", "createdAt");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WorkplaceAlertAck" (
        "id" TEXT NOT NULL,
        "alertId" TEXT NOT NULL,
        "deviceId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WorkplaceAlertAck_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "WorkplaceAlertAck_alertId_deviceId_key"
      ON "WorkplaceAlertAck"("alertId", "deviceId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WorkplaceAlert"
          ADD CONSTRAINT "WorkplaceAlert_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "WorkplaceAlertAck"
          ADD CONSTRAINT "WorkplaceAlertAck_alertId_fkey"
          FOREIGN KEY ("alertId") REFERENCES "WorkplaceAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GoDevicePresence" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "deviceId" TEXT NOT NULL,
        "deviceLabel" TEXT,
        "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GoDevicePresence_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "GoDevicePresence_teamId_deviceId_key"
      ON "GoDevicePresence"("teamId", "deviceId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GoDevicePresence_teamId_lastSeenAt_idx"
      ON "GoDevicePresence"("teamId", "lastSeenAt");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "GoDevicePresence"
          ADD CONSTRAINT "GoDevicePresence_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("[startup] WorkplaceAlert schema ensured");
  } catch (err) {
    console.error("[startup] ensureWorkplaceAlertsSchema failed:", err);
  }
}
