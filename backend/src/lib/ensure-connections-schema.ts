import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for lightweight Connections, blocking and privacy settings. */
export async function ensureConnectionsSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "messagePrivacy" TEXT NOT NULL DEFAULT 'connections_and_shared';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "User" ADD COLUMN "discoverableByEmail" BOOLEAN NOT NULL DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Connection" (
      "id" TEXT NOT NULL,
      "requesterId" TEXT NOT NULL,
      "recipientId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "pairKey" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Connection_pairKey_key" ON "Connection"("pairKey");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Connection_recipientId_status_idx" ON "Connection"("recipientId", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Connection_requesterId_status_idx" ON "Connection"("requesterId", "status");
  `);
  await addForeignKey(prisma, "Connection", "Connection_requesterId_fkey", "requesterId");
  await addForeignKey(prisma, "Connection", "Connection_recipientId_fkey", "recipientId");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserBlock" (
      "id" TEXT NOT NULL,
      "blockerId" TEXT NOT NULL,
      "blockedId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
  `);
  await addForeignKey(prisma, "UserBlock", "UserBlock_blockerId_fkey", "blockerId");
  await addForeignKey(prisma, "UserBlock", "UserBlock_blockedId_fkey", "blockedId");
}

async function addForeignKey(
  prisma: PrismaClient,
  table: string,
  constraint: string,
  column: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "${table}"
        ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${column}")
        REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}
