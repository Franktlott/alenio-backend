import type { PrismaClient } from "@prisma/client";

/** Additive runtime migration for the enterprise public profile fields. */
export async function ensurePublicProfileSchema(prisma: PrismaClient): Promise<void> {
  for (const column of [
    "profileTitle",
    "profileOrganization",
    "profileWebsite",
    "profileLocation",
    "profileBio",
    "profileHeaderImage",
  ]) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "${column}" TEXT`,
    );
  }
}
