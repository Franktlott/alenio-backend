import type { PrismaClient } from "@prisma/client";

/** Additive tables for admin-edited plans and their price history. */
export async function ensureBillingPlansSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."BillingPlan" (
      "key" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "bestFor" TEXT NOT NULL DEFAULT '',
      "features" JSONB NOT NULL DEFAULT '[]',
      "priceCents" INTEGER NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'usd',
      "interval" TEXT NOT NULL DEFAULT 'month',
      "stripePriceId" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("key")
    );
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."BillingPlan" ADD COLUMN IF NOT EXISTS "includedFeatures" JSONB;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."BillingPlanChange" (
      "id" TEXT NOT NULL,
      "planKey" TEXT NOT NULL,
      "summary" TEXT NOT NULL,
      "oldPriceCents" INTEGER,
      "newPriceCents" INTEGER,
      "oldStripePriceId" TEXT,
      "newStripePriceId" TEXT,
      "existingSubscribers" TEXT NOT NULL DEFAULT 'none',
      "moveStatus" TEXT NOT NULL DEFAULT 'none',
      "movedCount" INTEGER NOT NULL DEFAULT 0,
      "moveFailedCount" INTEGER NOT NULL DEFAULT 0,
      "actorId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BillingPlanChange_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "BillingPlanChange_planKey_createdAt_idx"
    ON public."BillingPlanChange"("planKey", "createdAt");
  `);
}
