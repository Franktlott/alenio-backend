import type { HomeInsightCard, HomeInsightSettings } from "@prisma/client";
import { prisma } from "../prisma";
import { toHomeInsightCardJson, type HomeInsightCardJson } from "./home-insight-serialize";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const DEFAULT_EPOCH = new Date(Date.UTC(2026, 7, 24));

export type HomeInsightScheduleMode = "automatic" | "manual";
export type HomeInsightCadence = "daily" | "weekly";

export type HomeInsightScheduleJson = {
  mode: HomeInsightScheduleMode;
  cadence: HomeInsightCadence;
  pinnedCardId: string | null;
  epochAt: string;
  updatedAt: string;
};

export type HomeInsightResolvedJson = {
  schedule: HomeInsightScheduleJson;
  cards: HomeInsightCardJson[];
  current: HomeInsightCardJson | null;
  currentIndex: number | null;
  nextChangeAt: string | null;
  nextCard: HomeInsightCardJson | null;
};

export function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function utcMondayStart(date: Date): number {
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - mondayOffset);
}

function rotationIndex(now: Date, epoch: Date, cadence: HomeInsightCadence, count: number): number {
  if (count < 1) return 0;
  if (cadence === "daily") {
    const elapsed = Math.floor((utcDayStart(now) - utcDayStart(epoch)) / DAY_MS);
    return ((elapsed % count) + count) % count;
  }
  const elapsed = Math.floor((utcMondayStart(now) - utcMondayStart(epoch)) / WEEK_MS);
  return ((elapsed % count) + count) % count;
}

function nextChangeAt(now: Date, cadence: HomeInsightCadence): Date {
  if (cadence === "daily") {
    return new Date(utcDayStart(now) + DAY_MS);
  }
  return new Date(utcMondayStart(now) + WEEK_MS);
}

export function toScheduleJson(settings: HomeInsightSettings): HomeInsightScheduleJson {
  return {
    mode: settings.mode === "manual" ? "manual" : "automatic",
    cadence: settings.cadence === "daily" ? "daily" : "weekly",
    pinnedCardId: settings.pinnedCardId,
    epochAt: settings.epochAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function ensureHomeInsightSettings(): Promise<HomeInsightSettings> {
  const existing = await prisma.homeInsightSettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  return prisma.homeInsightSettings.create({
    data: {
      id: "default",
      mode: "automatic",
      cadence: "weekly",
      pinnedCardId: null,
      epochAt: DEFAULT_EPOCH,
    },
  });
}

export function resolveHomeInsightDeck(
  cards: HomeInsightCard[],
  settings: HomeInsightSettings,
  now = new Date(),
): HomeInsightResolvedJson {
  const active = cards.filter((card) => card.isActive);
  const schedule = toScheduleJson(settings);
  const jsonCards = cards.map(toHomeInsightCardJson);

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
    const pinnedJson = toHomeInsightCardJson(pinned);
    const index = active.findIndex((card) => card.id === pinned.id);
    return {
      schedule,
      cards: jsonCards,
      current: pinnedJson,
      currentIndex: index >= 0 ? index : 0,
      nextChangeAt: null,
      nextCard: null,
    };
  }

  const cadence: HomeInsightCadence = settings.cadence === "daily" ? "daily" : "weekly";
  const epoch = settings.epochAt ?? DEFAULT_EPOCH;
  const index = rotationIndex(now, epoch, cadence, active.length);
  const current = active[index]!;
  const nextIndex = (index + 1) % active.length;
  const next = active[nextIndex]!;
  return {
    schedule,
    cards: jsonCards,
    current: toHomeInsightCardJson(current),
    currentIndex: index,
    nextChangeAt: nextChangeAt(now, cadence).toISOString(),
    nextCard: toHomeInsightCardJson(next),
  };
}

export async function loadResolvedHomeInsights(now = new Date()): Promise<HomeInsightResolvedJson> {
  const [settings, cards] = await Promise.all([
    ensureHomeInsightSettings(),
    prisma.homeInsightCard.findMany({ orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  return resolveHomeInsightDeck(cards, settings, now);
}
