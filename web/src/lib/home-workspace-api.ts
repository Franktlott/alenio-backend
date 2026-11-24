import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "./api";

export const MAX_HOME_WORKSPACE_CARDS = 5;

export type HomeWorkspaceDestination =
  | { type: "create" }
  | { type: "join" };

export type HomeWorkspaceCard = {
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
  destination: HomeWorkspaceDestination;
  displayOrder: number;
  isActive: boolean;
  updatedAt: string;
};

export type HomeWorkspaceSchedule = {
  mode: "automatic" | "manual";
  cadence: "daily" | "weekly";
  pinnedCardId: string | null;
  epochAt: string;
  updatedAt: string;
};

export type HomeWorkspaceResolved = {
  schedule: HomeWorkspaceSchedule;
  cards: HomeWorkspaceCard[];
  current: HomeWorkspaceCard | null;
  currentIndex: number | null;
  nextChangeAt: string | null;
  nextCard: HomeWorkspaceCard | null;
};

export type HomeWorkspaceInput = {
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
  destinationType: "create" | "join";
  displayOrder?: number;
  isActive?: boolean;
};

export type HomeWorkspaceScheduleInput = {
  mode: "automatic" | "manual";
  cadence?: "daily" | "weekly";
  pinnedCardId?: string | null;
};

export function fetchHomeWorkspaceAdmin() {
  return apiGetJson<{ data: HomeWorkspaceResolved }>("/api/admin/home-workspace").then(
    (r) => r.data,
  );
}

export function updateHomeWorkspaceSchedule(body: HomeWorkspaceScheduleInput) {
  return apiPatchJson<{ data: HomeWorkspaceResolved }>(
    "/api/admin/home-workspace/schedule",
    body,
  ).then((r) => r.data);
}

export function fetchHomeWorkspaceAdminCard(id: string) {
  return apiGetJson<{ data: HomeWorkspaceCard }>(
    `/api/admin/home-workspace/${encodeURIComponent(id)}`,
  ).then((r) => r.data);
}

export function createHomeWorkspaceCard(body: HomeWorkspaceInput) {
  return apiPostJson<{ data: HomeWorkspaceCard }>("/api/admin/home-workspace", body).then(
    (r) => r.data,
  );
}

export function updateHomeWorkspaceCard(id: string, body: Partial<HomeWorkspaceInput>) {
  return apiPatchJson<{ data: HomeWorkspaceCard }>(
    `/api/admin/home-workspace/${encodeURIComponent(id)}`,
    body,
  ).then((r) => r.data);
}

export function deleteHomeWorkspaceCard(id: string) {
  return apiDeleteJson<{ data: { ok: boolean } }>(
    `/api/admin/home-workspace/${encodeURIComponent(id)}`,
  );
}

export function reorderHomeWorkspaceCards(ids: string[]) {
  return apiPostJson<{ data: HomeWorkspaceResolved }>("/api/admin/home-workspace/reorder", {
    ids,
  }).then((r) => r.data);
}
