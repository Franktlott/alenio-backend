import type { PrismaClient } from "@prisma/client";

/** Adds per-workspace workplace standards column if missing (idempotent). */
export async function ensureWorkplaceStandardsSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Team" ADD COLUMN "workplaceStandards" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    console.log("[startup] workplace standards column ensured");
  } catch (err) {
    console.error("[startup] ensureWorkplaceStandardsSchema failed:", err);
  }
}
