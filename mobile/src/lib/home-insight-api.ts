import { api } from "@/lib/api/api";

export type HomeInsightApiDestination =
  | { type: "recognition" }
  | { type: "seneca"; prompt: string }
  | { type: "discover"; articleId: string; slug: string };

export type HomeInsightApiCard = {
  id: string;
  slug: string;
  title: string;
  body: string;
  actionLabel: string;
  accessibilityLabel: string;
  imageUrl: string | null;
  imageAlt: string | null;
  surfaceColor: string;
  fadeColors: [string, string, string];
  borderColor: string;
  titleColor: string;
  bodyColor: string;
  buttonColors: [string, string];
  destination: HomeInsightApiDestination;
  displayOrder: number;
  isActive: boolean;
  updatedAt: string;
};

export type HomeInsightSchedule = {
  mode: "automatic" | "manual";
  cadence: "daily" | "weekly";
  pinnedCardId: string | null;
  epochAt: string;
  updatedAt: string;
};

export type HomeInsightResolved = {
  schedule: HomeInsightSchedule;
  cards: HomeInsightApiCard[];
  current: HomeInsightApiCard | null;
  currentIndex: number | null;
  nextChangeAt: string | null;
  nextCard: HomeInsightApiCard | null;
  /** Older servers may only return a bare array via unwrap — not used when resolved. */
  items?: HomeInsightApiCard[];
};

export function fetchHomeInsights(): Promise<HomeInsightResolved | HomeInsightApiCard[]> {
  return api.get<HomeInsightResolved | HomeInsightApiCard[]>("/api/home-insights");
}
