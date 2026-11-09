import type { PrismaClient } from "@prisma/client";

const STARTER_CATEGORIES = [
  { name: "Reflection", slug: "reflection", description: "Pause and see a situation more clearly.", icon: "spark", displayOrder: 1 },
  { name: "Growth", slug: "growth", description: "Small habits that build lasting momentum.", icon: "sprout", displayOrder: 2 },
  { name: "Leadership", slug: "leadership", description: "Lead with clarity, care, and accountability.", icon: "compass", displayOrder: 3 },
  { name: "Communication", slug: "communication", description: "Say the hard thing in a way people can hear.", icon: "message", displayOrder: 4 },
  { name: "Connection", slug: "connection", description: "The value of meaningful relationships.", icon: "leaf", displayOrder: 5 },
  { name: "Wellbeing", slug: "wellbeing", description: "Stay steady while the work stays demanding.", icon: "heart", displayOrder: 6 },
  { name: "Productivity", slug: "productivity", description: "Focus on the work that actually moves things.", icon: "check", displayOrder: 7 },
] as const;

export async function ensureDiscoverSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."DiscoverCategory" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "icon" TEXT,
      "displayOrder" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DiscoverCategory_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "DiscoverCategory_slug_key" ON public."DiscoverCategory"("slug");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DiscoverCategory_isActive_displayOrder_idx"
    ON public."DiscoverCategory"("isActive", "displayOrder");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."DiscoverArticle" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "excerpt" TEXT NOT NULL DEFAULT '',
      "content" JSONB NOT NULL,
      "categoryId" TEXT,
      "coverImageUrl" TEXT,
      "coverImageAlt" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "isFeatured" BOOLEAN NOT NULL DEFAULT false,
      "featuredInCategory" BOOLEAN NOT NULL DEFAULT false,
      "displayOrder" INTEGER NOT NULL DEFAULT 0,
      "readingTimeMinutes" INTEGER NOT NULL DEFAULT 0,
      "senecaEnabled" BOOLEAN NOT NULL DEFAULT false,
      "senecaPrompt" TEXT NOT NULL DEFAULT '',
      "senecaContext" TEXT NOT NULL DEFAULT '',
      "publishedAt" TIMESTAMP(3),
      "scheduledAt" TIMESTAMP(3),
      "viewCount" INTEGER NOT NULL DEFAULT 0,
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DiscoverArticle_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "DiscoverArticle_slug_key" ON public."DiscoverArticle"("slug");
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."DiscoverArticle"
      ADD COLUMN IF NOT EXISTS "lastPublishedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "lastPublishedById" TEXT,
      ADD COLUMN IF NOT EXISTS "authorName" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "pendingDraft" JSONB,
      ADD COLUMN IF NOT EXISTS "pendingDraftAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "pendingDraftById" TEXT;
  `);
  // Articles published before these columns existed: best guess is the publish date and the last editor.
  await prisma.$executeRawUnsafe(`
    UPDATE public."DiscoverArticle"
    SET "lastPublishedAt" = "publishedAt",
        "lastPublishedById" = COALESCE("updatedById", "createdById")
    WHERE "lastPublishedAt" IS NULL AND "publishedAt" IS NOT NULL AND "status" = 'published';
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DiscoverArticle_status_publishedAt_idx"
    ON public."DiscoverArticle"("status", "publishedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DiscoverArticle_status_scheduledAt_idx"
    ON public."DiscoverArticle"("status", "scheduledAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DiscoverArticle_categoryId_status_idx"
    ON public."DiscoverArticle"("categoryId", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "DiscoverArticle_isFeatured_displayOrder_idx"
    ON public."DiscoverArticle"("isFeatured", "displayOrder");
  `);

  const existing = await prisma.discoverCategory.count();
  if (existing === 0) {
    await prisma.discoverCategory.createMany({ data: [...STARTER_CATEGORIES] });
  }
}
