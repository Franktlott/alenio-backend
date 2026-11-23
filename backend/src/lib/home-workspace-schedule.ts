import type { HomeWorkspaceSettings } from "@prisma/client";
import { prisma } from "../prisma";
import {
  toHomeWorkspaceCardJson,
  type HomeWorkspaceCardJson,
} from "./home-workspace-serialize";

export type HomeWorkspaceScheduleJson = {
  mode: "automatic" | "manual";
  pinnedCardId: string | null;
  updatedAt: string;
};

export type HomeWorkspaceResolvedJson = {
  schedule: HomeWorkspaceScheduleJson;
  cards: HomeWorkspaceCardJson[];
  current: HomeWorkspaceCardJson | null;
};

export function toWorkspaceScheduleJson(
  settings: HomeWorkspaceSettings,
): HomeWorkspaceScheduleJson {
  return {
    mode: settings.mode === "automatic" ? "automatic" : "manual",
    pinnedCardId: settings.pinnedCardId,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function ensureHomeWorkspaceSettings() {
  let settings = await prisma.homeWorkspaceSettings.findUnique({
    where: { id: "default" },
  });
  if (!settings) {
    const first = await prisma.homeWorkspaceCard.findFirst({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    settings = await prisma.homeWorkspaceSettings.create({
      data: {
        id: "default",
        mode: "manual",
        pinnedCardId: first?.id ?? null,
      },
    });
  }
  return settings;
}

export async function loadResolvedHomeWorkspace(): Promise<HomeWorkspaceResolvedJson> {
  const [settings, cards] = await Promise.all([
    ensureHomeWorkspaceSettings(),
    prisma.homeWorkspaceCard.findMany({
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const jsonCards = cards.map(toHomeWorkspaceCardJson);
  const active = jsonCards.filter((card) => card.isActive);

  let current: HomeWorkspaceCardJson | null = null;
  if (settings.mode === "manual" && settings.pinnedCardId) {
    current =
      active.find((card) => card.id === settings.pinnedCardId) ??
      active[0] ??
      null;
  } else {
    current = active[0] ?? null;
  }

  return {
    schedule: toWorkspaceScheduleJson(settings),
    cards: jsonCards,
    current,
  };
}
