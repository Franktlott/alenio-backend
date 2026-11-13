import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { env } from "../env";
import { HOME_INSIGHT_SEED_CARDS } from "./home-insight-seed";

function absoluteImageUrl(path: string): string {
  if (/^https:\/\//i.test(path)) return path;
  const origin = (env.WEB_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function ensureHomeInsightSchema(prisma: PrismaClient): Promise<void> {
  console.log("[startup] ensuring HomeInsightCard schema");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."HomeInsightCard" (
      "id" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "actionLabel" TEXT NOT NULL,
      "accessibilityLabel" TEXT NOT NULL DEFAULT '',
      "imageUrl" TEXT,
      "imageAlt" TEXT,
      "surfaceColor" TEXT NOT NULL DEFAULT '#F7F1FF',
      "fadeColors" JSONB NOT NULL,
      "borderColor" TEXT NOT NULL DEFAULT '#E6D8FF',
      "titleColor" TEXT NOT NULL DEFAULT '#17172B',
      "bodyColor" TEXT NOT NULL DEFAULT '#69677B',
      "buttonColors" JSONB NOT NULL,
      "destinationType" TEXT NOT NULL DEFAULT 'seneca',
      "senecaPrompt" TEXT NOT NULL DEFAULT '',
      "discoverArticleId" TEXT,
      "discoverSlug" TEXT,
      "displayOrder" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "HomeInsightCard_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "HomeInsightCard_slug_key" ON public."HomeInsightCard"("slug");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "HomeInsightCard_isActive_displayOrder_idx"
    ON public."HomeInsightCard"("isActive", "displayOrder");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."HomeInsightSettings" (
      "id" TEXT NOT NULL,
      "mode" TEXT NOT NULL DEFAULT 'automatic',
      "cadence" TEXT NOT NULL DEFAULT 'weekly',
      "pinnedCardId" TEXT,
      "epochAt" TIMESTAMP(3) NOT NULL DEFAULT '2026-08-24 00:00:00',
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedById" TEXT,
      CONSTRAINT "HomeInsightSettings_pkey" PRIMARY KEY ("id")
    );
  `);

  const existing = await prisma.homeInsightCard.count();
  if (existing === 0) {
    for (const card of HOME_INSIGHT_SEED_CARDS) {
      await prisma.homeInsightCard.create({
        data: {
          slug: card.slug,
          title: card.title,
          body: card.body,
          actionLabel: card.actionLabel,
          accessibilityLabel: card.accessibilityLabel,
          imageUrl: absoluteImageUrl(card.imagePath),
          surfaceColor: card.surfaceColor,
          fadeColors: card.fadeColors as unknown as Prisma.InputJsonValue,
          borderColor: card.borderColor,
          titleColor: card.titleColor,
          bodyColor: card.bodyColor,
          buttonColors: card.buttonColors as unknown as Prisma.InputJsonValue,
          destinationType: card.destinationType,
          senecaPrompt: card.senecaPrompt,
          displayOrder: card.displayOrder,
          isActive: true,
        },
      });
    }
    console.log(`[startup] HomeInsightCard seeded (${HOME_INSIGHT_SEED_CARDS.length} cards)`);
  } else {
    console.log(`[startup] HomeInsightCard ready (${existing} cards)`);
  }

  const settingsCount = await prisma.homeInsightSettings.count();
  if (settingsCount === 0) {
    await prisma.homeInsightSettings.create({
      data: {
        id: "default",
        mode: "automatic",
        cadence: "weekly",
        pinnedCardId: null,
        epochAt: new Date(Date.UTC(2026, 7, 24)),
      },
    });
    console.log("[startup] HomeInsightSettings seeded (automatic weekly)");
  }
}
