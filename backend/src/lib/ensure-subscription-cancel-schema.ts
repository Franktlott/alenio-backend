import type { PrismaClient } from "@prisma/client";

/** Idempotent runtime schema for Stripe cancel-at-period-end on team subscriptions. */
export async function ensureSubscriptionCancelSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "TeamSubscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
}
