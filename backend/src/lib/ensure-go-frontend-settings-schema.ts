import type { PrismaClient } from "@prisma/client";

/** Adds per-workspace Alenio Go frontend settings column if missing (idempotent). */
export async function ensureGoFrontendSettingsSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Team" ADD COLUMN "goFrontendSettings" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    console.log("[startup] go frontend settings column ensured");
  } catch (err) {
    console.error("[startup] ensureGoFrontendSettingsSchema failed:", err);
  }
}
