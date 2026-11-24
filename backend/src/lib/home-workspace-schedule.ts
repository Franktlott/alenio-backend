import type { HomeWorkspaceCard, HomeWorkspaceSettings } from "@prisma/client";
import { prisma } from "../prisma";
import {
  toHomeWorkspaceCardJson,
  type HomeWorkspaceCardJson,
} from "./home-workspace-serialize";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const DEFAULT_EPOCH = new Date(Date.UTC(2026, 7, 24));

/** Hard cap for the Alenio Workspace promo deck. */
export const MAX_HOME_WORKSPACE_CARDS = 5;

export type HomeWorkspaceScheduleMode = "automatic" | "manual";
export type HomeWorkspaceCadence = "daily" | "weekly";

export type HomeWorkspaceScheduleJson = {
  mode: HomeWorkspaceScheduleMode;
  cadence: HomeWorkspaceCadence;
  pinnedCardId: string | null;
  epochAt: string;
  updatedAt: string;
};

export type HomeWorkspaceResolvedJson = {
  schedule: HomeWorkspaceScheduleJson;
  cards: HomeWorkspaceCardJson[];
  current: HomeWorkspaceCardJson | null;
  currentIndex: number | null;
  nextChangeAt: string | null;
  nextCard: HomeWorkspaceCardJson | null;
};

function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function utcMondayStart(date: Date): number {
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - mondayOffset,
  );
}

function rotationIndex(
  now: Date,
  epoch: Date,
  cadence: HomeWorkspaceCadence,
  count: number,
): number {
  if (count < 1) return 0;
  if (cadence === "daily") {
    const elapsed = Math.floor((utcDayStart(now) - utcDayStart(epoch)) / DAY_MS);
    return ((elapsed % count) + count) % count;
  }
  const elapsed = Math.floor(
    (utcMondayStart(now) - utcMondayStart(epoch)) / WEEK_MS,
  );
  return ((elapsed % count) + count) % count;
}

function nextChangeAt(now: Date, cadence: HomeWorkspaceCadence): Date {
  if (cadence === "daily") {
    return new Date(utcDayStart(now) + DAY_MS);
  }
  return new Date(utcMondayStart(now) + WEEK_MS);
}

export function toWorkspaceScheduleJson(
  settings: HomeWorkspaceSettings,
): HomeWorkspaceScheduleJson {
  return {
    mode: settings.mode === "manual" ? "manual" : "automatic",
    cadence: settings.cadence === "daily" ? "daily" : "weekly",
    pinnedCardId: settings.pinnedCardId,
    epochAt: (settings.epochAt ?? DEFAULT_EPOCH).toISOString(),
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
        mode: "automatic",
        cadence: "weekly",
        pinnedCardId: first?.id ?? null,
        epochAt: DEFAULT_EPOCH,
      },
    });
  }
  return settings;
}

export function resolveHomeWorkspaceDeck(
  cards: HomeWorkspaceCard[],
  settings: HomeWorkspaceSettings,
  now = new Date(),
): HomeWorkspaceResolvedJson {
  const active = cards.filter((card) => card.isActive);
  const schedule = toWorkspaceScheduleJson(settings);
  const jsonCards = cards.map(toHomeWorkspaceCardJson);

  if (active.length === 0) {
    return {
      schedule,
      cards: jsonCards,
      current: null,
      currentIndex: null,
      nextChangeAt: null,
      nextCard: null,
    };
  }

  if (settings.mode === "manual") {
    const pinned =
      (settings.pinnedCardId
        ? active.find((card) => card.id === settings.pinnedCardId)
        : null) ?? active[0]!;
    const index = active.findIndex((card) => card.id === pinned.id);
    return {
      schedule,
      cards: jsonCards,
      current: toHomeWorkspaceCardJson(pinned),
      currentIndex: index >= 0 ? index : 0,
      nextChangeAt: null,
      nextCard: null,
    };
  }

  const cadence: HomeWorkspaceCadence =
    settings.cadence === "daily" ? "daily" : "weekly";
  const epoch = settings.epochAt ?? DEFAULT_EPOCH;
  const index = rotationIndex(now, epoch, cadence, active.length);
  const current = active[index]!;
  const nextIndex = (index + 1) % active.length;
  const next = active[nextIndex]!;
  return {
    schedule,
    cards: jsonCards,
    current: toHomeWorkspaceCardJson(current),
    currentIndex: index,
    nextChangeAt: nextChangeAt(now, cadence).toISOString(),
    nextCard: toHomeWorkspaceCardJson(next),
  };
}

export async function loadResolvedHomeWorkspace(
  now = new Date(),
): Promise<HomeWorkspaceResolvedJson> {
  const [settings, cards] = await Promise.all([
    ensureHomeWorkspaceSettings(),
    prisma.homeWorkspaceCard.findMany({
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return resolveHomeWorkspaceDeck(cards, settings, now);
}
