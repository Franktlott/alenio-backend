import type { PrismaClient } from "@prisma/client";

/** Creates GoLoginRequest table if missing (idempotent). */
export async function ensureGoLoginSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GoLoginRequest" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "deviceId" TEXT NOT NULL,
        "deviceLabel" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "approvedByUserId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GoLoginRequest_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "GoLoginRequest_teamId_deviceId_key"
      ON "GoLoginRequest"("teamId", "deviceId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "GoLoginRequest_teamId_status_idx"
      ON "GoLoginRequest"("teamId", "status");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "GoLoginRequest"
          ADD CONSTRAINT "GoLoginRequest_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("[startup] GoLoginRequest schema ensured");
  } catch (err) {
    console.error("[startup] ensureGoLoginSchema failed:", err);
  }
}
