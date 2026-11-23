import { api } from "@/lib/api/api";

export type HomeWorkspaceDestination =
  | { type: "create" }
  | { type: "join" };

export type HomeWorkspaceApiCard = {
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

export type HomeWorkspaceResolved = {
  schedule: {
    mode: "automatic" | "manual";
    pinnedCardId: string | null;
    updatedAt: string;
  };
  cards: HomeWorkspaceApiCard[];
  current: HomeWorkspaceApiCard | null;
};

export function fetchHomeWorkspaceCard(): Promise<HomeWorkspaceResolved> {
  return api.get<HomeWorkspaceResolved>("/api/home-workspace");
}
