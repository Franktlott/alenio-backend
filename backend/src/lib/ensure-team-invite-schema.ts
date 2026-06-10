import type { PrismaClient } from "@prisma/client";

/** Creates team invite table if missing (idempotent). */
export async function ensureTeamInviteSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TeamInvite" (
        "id" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "invitedById" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "acceptedUserId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "acceptedAt" TIMESTAMP(3),
        CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "TeamInvite_token_key" ON "TeamInvite"("token");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TeamInvite_teamId_status_idx" ON "TeamInvite"("teamId", "status");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TeamInvite_email_status_idx" ON "TeamInvite"("email", "status");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TeamInvite"
          ADD CONSTRAINT "TeamInvite_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TeamInvite"
          ADD CONSTRAINT "TeamInvite_invitedById_fkey"
          FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TeamInvite"
          ADD CONSTRAINT "TeamInvite_acceptedUserId_fkey"
          FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  } catch (err) {
    console.error("[startup] ensureTeamInviteSchema failed:", err);
  }
}
