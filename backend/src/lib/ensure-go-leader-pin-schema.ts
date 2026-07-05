import type { PrismaClient } from "@prisma/client";

/** Adds per-workspace Alenio Go leader PIN hash column if missing (idempotent). */
export async function ensureGoLeaderPinSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TeamMember" ADD COLUMN "goPinHash" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    console.log("[startup] go leader PIN column ensured");
  } catch (err) {
    console.error("[startup] ensureGoLeaderPinSchema failed:", err);
  }
}
