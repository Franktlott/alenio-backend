import type { PrismaClient } from "@prisma/client";

/** Additive tables for Google Play external content links reporting. */
export async function ensurePlayLinksSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."PlayLinkOut" (
      "id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "teamId" TEXT,
      "pendingCheckoutId" TEXT,
      "stripeSubscriptionId" TEXT,
      "initialTransactionId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlayLinkOut_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayLinkOut_stripeSubscriptionId_idx"
    ON public."PlayLinkOut"("stripeSubscriptionId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."PlayExternalReport" (
      "id" TEXT NOT NULL,
      "linkOutId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "stripeInvoiceId" TEXT,
      "stripePaymentIntentId" TEXT,
      "refundsTransactionId" TEXT,
      "preTaxMicros" TEXT NOT NULL,
      "taxMicros" TEXT NOT NULL DEFAULT '0',
      "currency" TEXT NOT NULL,
      "transactionTime" TIMESTAMP(3) NOT NULL,
      "testPurchase" BOOLEAN NOT NULL DEFAULT false,
      "fullRefund" BOOLEAN NOT NULL DEFAULT false,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "lastError" TEXT,
      "reportedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlayExternalReport_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayExternalReport_status_createdAt_idx"
    ON public."PlayExternalReport"("status", "createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PlayExternalReport_stripePaymentIntentId_idx"
    ON public."PlayExternalReport"("stripePaymentIntentId");
  `);
}
