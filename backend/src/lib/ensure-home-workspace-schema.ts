import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { env } from "../env";
import { HOME_WORKSPACE_SEED_CARDS } from "./home-workspace-seed";

function absoluteImageUrl(path: string): string {
  if (/^https:\/\//i.test(path)) return path;
  const origin = (env.WEB_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function ensureHomeWorkspaceSchema(prisma: PrismaClient): Promise<void> {
  console.log("[startup] ensuring HomeWorkspaceCard schema");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."HomeWorkspaceCard" (
      "id" TEXT NOT NULL,
      "slug" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "actionLabel" TEXT NOT NULL,
      "accessibilityLabel" TEXT NOT NULL DEFAULT '',
      "imageUrl" TEXT,
      "imageAlt" TEXT,
      "surfaceColor" TEXT NOT NULL DEFAULT '#1A0B3A',
      "fadeColors" JSONB NOT NULL,
      "borderColor" TEXT NOT NULL DEFAULT '#2A0F63',
      "titleColor" TEXT NOT NULL DEFAULT '#FFFFFF',
      "bodyColor" TEXT NOT NULL DEFAULT 'rgba(255,255,255,0.72)',
      "buttonColors" JSONB NOT NULL,
      "destinationType" TEXT NOT NULL DEFAULT 'create',
      "displayOrder" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "HomeWorkspaceCard_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "HomeWorkspaceCard_slug_key"
    ON public."HomeWorkspaceCard"("slug");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "HomeWorkspaceCard_isActive_displayOrder_idx"
    ON public."HomeWorkspaceCard"("isActive", "displayOrder");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."HomeWorkspaceSettings" (
      "id" TEXT NOT NULL,
      "mode" TEXT NOT NULL DEFAULT 'automatic',
      "cadence" TEXT NOT NULL DEFAULT 'weekly',
      "pinnedCardId" TEXT,
      "epochAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedById" TEXT,
      CONSTRAINT "HomeWorkspaceSettings_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."HomeWorkspaceSettings"
      ADD COLUMN IF NOT EXISTS "cadence" TEXT NOT NULL DEFAULT 'weekly'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."HomeWorkspaceSettings"
      ADD COLUMN IF NOT EXISTS "epochAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);

  const existing = await prisma.homeWorkspaceCard.count();
  if (existing === 0) {
    for (const card of HOME_WORKSPACE_SEED_CARDS) {
      await prisma.homeWorkspaceCard.create({
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
          displayOrder: card.displayOrder,
          isActive: true,
        },
      });
    }
    console.log(
      `[startup] HomeWorkspaceCard seeded (${HOME_WORKSPACE_SEED_CARDS.length} cards)`,
    );
  } else {
    console.log(`[startup] HomeWorkspaceCard ready (${existing} cards)`);
  }

  const settingsCount = await prisma.homeWorkspaceSettings.count();
  if (settingsCount === 0) {
    const first = await prisma.homeWorkspaceCard.findFirst({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    await prisma.homeWorkspaceSettings.create({
      data: {
        id: "default",
        mode: "automatic",
        cadence: "weekly",
        pinnedCardId: first?.id ?? null,
        epochAt: new Date(Date.UTC(2026, 7, 24)),
      },
    });
  }
}
