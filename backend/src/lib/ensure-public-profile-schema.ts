import type { PrismaClient } from "@prisma/client";

/** Additive runtime migration for the enterprise public profile fields. */
export async function ensurePublicProfileSchema(prisma: PrismaClient): Promise<void> {
  for (const column of [
    "profileTitle",
    "profileOrganization",
    "profileWebsite",
    "profileLocation",
    "profileBio",
  ]) {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "User" ADD COLUMN "${column}" TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
  }
}
