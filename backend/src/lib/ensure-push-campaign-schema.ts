import type { PrismaClient } from "@prisma/client";

/** Additive tables for admin push campaigns and the user's opt-out column. */
export async function ensurePushCampaignSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "notifProductUpdates" BOOLEAN NOT NULL DEFAULT true;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."PushCampaign" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'product_announcement',
      "category" TEXT NOT NULL DEFAULT '',
      "audienceKind" TEXT NOT NULL DEFAULT 'all',
      "audienceTeamId" TEXT,
      "linkKind" TEXT NOT NULL DEFAULT 'home',
      "linkValue" TEXT NOT NULL DEFAULT '',
      "status" TEXT NOT NULL DEFAULT 'draft',
      "deliveryMode" TEXT NOT NULL DEFAULT 'immediate',
      "scheduledAt" TIMESTAMP(3),
      "createdById" TEXT NOT NULL,
      "updatedById" TEXT,
      "submittedAt" TIMESTAMP(3),
      "submittedById" TEXT,
      "approvedAt" TIMESTAMP(3),
      "approvedById" TEXT,
      "rejectedAt" TIMESTAMP(3),
      "rejectedById" TEXT,
      "rejectionNote" TEXT NOT NULL DEFAULT '',
      "sentAt" TIMESTAMP(3),
      "recipientCount" INTEGER NOT NULL DEFAULT 0,
      "deliveredCount" INTEGER NOT NULL DEFAULT 0,
      "openCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PushCampaign_status_scheduledAt_idx" ON public."PushCampaign"("status", "scheduledAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PushCampaign_updatedAt_idx" ON public."PushCampaign"("updatedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."PushCampaignOpen" (
      "id" TEXT NOT NULL,
      "campaignId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PushCampaignOpen_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "PushCampaignOpen_campaignId_fkey" FOREIGN KEY ("campaignId")
        REFERENCES public."PushCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PushCampaignOpen_campaignId_userId_key"
    ON public."PushCampaignOpen"("campaignId", "userId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."PushTemplate" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'product_announcement',
      "category" TEXT NOT NULL DEFAULT '',
      "linkKind" TEXT NOT NULL DEFAULT 'home',
      "linkValue" TEXT NOT NULL DEFAULT '',
      "createdById" TEXT NOT NULL,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PushTemplate_pkey" PRIMARY KEY ("id")
    );
  `);
}
