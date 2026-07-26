import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for ownership transfer. */
export async function ensureOwnershipTransferSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OwnershipTransfer" (
      "id" TEXT PRIMARY KEY,
      "teamId" TEXT NOT NULL,
      "fromUserId" TEXT NOT NULL,
      "toUserId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "previousOwnerDisposition" TEXT NOT NULL,
      "billingPath" TEXT NOT NULL DEFAULT 'KEEP_PAYMENT_METHOD',
      "awaitingPaymentMethod" BOOLEAN NOT NULL DEFAULT false,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "acceptedAt" TIMESTAMP(3),
      "canceledAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "OwnershipTransfer"
        ADD CONSTRAINT "OwnershipTransfer_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "OwnershipTransfer"
        ADD CONSTRAINT "OwnershipTransfer_fromUserId_fkey"
        FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "OwnershipTransfer"
        ADD CONSTRAINT "OwnershipTransfer_toUserId_fkey"
        FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "OwnershipTransfer_teamId_status_idx"
    ON "OwnershipTransfer" ("teamId", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "OwnershipTransfer_toUserId_status_idx"
    ON "OwnershipTransfer" ("toUserId", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "OwnershipTransfer_expiresAt_idx"
    ON "OwnershipTransfer" ("expiresAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "OwnershipTransfer_one_pending_per_team"
    ON "OwnershipTransfer" ("teamId") WHERE "status" = 'PENDING';
  `);
}
