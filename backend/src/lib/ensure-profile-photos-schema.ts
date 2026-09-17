import type { PrismaClient } from "@prisma/client";

/** Additive runtime migration for the public profile photo gallery. */
export async function ensureProfilePhotosSchema(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserProfilePhoto" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "width" INTEGER,
      "height" INTEGER,
      "position" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserProfilePhoto_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserProfilePhoto_userId_position_idx"
      ON "UserProfilePhoto" ("userId", "position");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "UserProfilePhoto"
        ADD CONSTRAINT "UserProfilePhoto_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}
