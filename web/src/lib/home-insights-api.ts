import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "./api";

export type HomeInsightDestination =
  | { type: "recognition" }
  | { type: "seneca"; prompt: string }
  | { type: "discover"; articleId: string; slug: string };

export type HomeInsightCard = {
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
  destination: HomeInsightDestination;
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
  cards: HomeInsightCard[];
  current: HomeInsightCard | null;
  currentIndex: number | null;
  nextChangeAt: string | null;
  nextCard: HomeInsightCard | null;
};

export type HomeInsightInput = {
  title: string;
  slug?: string;
  body: string;
  actionLabel: string;
  accessibilityLabel?: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  surfaceColor?: string;
  fadeColors?: [string, string, string];
  borderColor?: string;
  titleColor?: string;
  bodyColor?: string;
  buttonColors?: [string, string];
  destinationType: "recognition" | "seneca" | "discover";
  senecaPrompt?: string;
  discoverArticleId?: string | null;
  discoverSlug?: string | null;
  displayOrder?: number;
  isActive?: boolean;
};

export type HomeInsightScheduleInput = {
  mode: "automatic" | "manual";
  cadence?: "daily" | "weekly";
  pinnedCardId?: string | null;
  epochAt?: string;
};

export function fetchHomeInsightsAdmin() {
  return apiGetJson<{ data: HomeInsightResolved }>("/api/admin/home-insights").then((r) => r.data);
}

export function updateHomeInsightSchedule(body: HomeInsightScheduleInput) {
  return apiPatchJson<{ data: HomeInsightResolved }>("/api/admin/home-insights/schedule", body).then(
    (r) => r.data,
  );
}

export function fetchHomeInsightAdmin(id: string) {
  return apiGetJson<{ data: HomeInsightCard }>(`/api/admin/home-insights/${encodeURIComponent(id)}`).then(
    (r) => r.data,
  );
}

export function createHomeInsight(body: HomeInsightInput) {
  return apiPostJson<{ data: HomeInsightCard }>("/api/admin/home-insights", body).then((r) => r.data);
}

export function updateHomeInsight(id: string, body: Partial<HomeInsightInput>) {
  return apiPatchJson<{ data: HomeInsightCard }>(
    `/api/admin/home-insights/${encodeURIComponent(id)}`,
    body,
  ).then((r) => r.data);
}

export function reorderHomeInsights(ids: string[]) {
  return apiPostJson<{ data: HomeInsightResolved }>("/api/admin/home-insights/reorder", { ids }).then(
    (r) => r.data,
  );
}

export function deleteHomeInsight(id: string) {
  return apiDeleteJson<{ data: { deleted: boolean } }>(
    `/api/admin/home-insights/${encodeURIComponent(id)}`,
  );
}

/** Signed-in reader deck + live card for Home. */
export function fetchHomeInsightsPublic() {
  return apiGetJson<{ data: HomeInsightResolved }>("/api/home-insights").then((r) => r.data);
}
