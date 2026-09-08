import type { PrismaClient } from "@prisma/client";

/**
 * Additive task classification rollout.
 *
 * Existing tasks and recurrence series are workspace tasks but are deliberately
 * ineligible for new Momentum credit. Existing canonical credits are untouched.
 */
export async function ensureTaskKindSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Task"
      ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'workspace_task';
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Task"
      ADD COLUMN IF NOT EXISTS "momentumEligible" BOOLEAN NOT NULL DEFAULT false;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RecurrenceSeries"
      ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'workspace_task';
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RecurrenceSeries"
      ADD COLUMN IF NOT EXISTS "momentumEligible" BOOLEAN NOT NULL DEFAULT false;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Task"
        ADD CONSTRAINT "Task_kind_check"
        CHECK ("kind" IN ('workspace_task', 'reminder'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Task"
        ADD CONSTRAINT "Task_reminder_momentumEligible_check"
        CHECK ("kind" <> 'reminder' OR "momentumEligible" = false);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "RecurrenceSeries"
        ADD CONSTRAINT "RecurrenceSeries_kind_check"
        CHECK ("kind" IN ('workspace_task', 'reminder'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "RecurrenceSeries"
        ADD CONSTRAINT "RecurrenceSeries_reminder_momentumEligible_check"
        CHECK ("kind" <> 'reminder' OR "momentumEligible" = false);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION "prevent_momentum_eligibility_update"()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW."kind" IS DISTINCT FROM OLD."kind" THEN
        RAISE EXCEPTION 'kind is an immutable creation-time classification';
      END IF;
      IF NEW."momentumEligible" IS DISTINCT FROM OLD."momentumEligible" THEN
        RAISE EXCEPTION 'momentumEligible is an immutable creation-time snapshot';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      DROP TRIGGER IF EXISTS "Task_momentumEligible_immutable" ON "Task";
      CREATE TRIGGER "Task_momentumEligible_immutable"
        BEFORE UPDATE OF "kind", "momentumEligible" ON "Task"
        FOR EACH ROW EXECUTE FUNCTION "prevent_momentum_eligibility_update"();
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      DROP TRIGGER IF EXISTS "RecurrenceSeries_momentumEligible_immutable"
        ON "RecurrenceSeries";
      CREATE TRIGGER "RecurrenceSeries_momentumEligible_immutable"
        BEFORE UPDATE OF "kind", "momentumEligible" ON "RecurrenceSeries"
        FOR EACH ROW EXECUTE FUNCTION "prevent_momentum_eligibility_update"();
    END
    $$;
  `);
}
