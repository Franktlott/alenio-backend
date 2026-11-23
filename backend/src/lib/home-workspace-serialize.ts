import type { HomeWorkspaceCard } from "@prisma/client";

export type HomeWorkspaceDestinationType = "create" | "join";

export type HomeWorkspaceDestinationJson =
  | { type: "create" }
  | { type: "join" };

export type HomeWorkspaceCardJson = {
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
  destination: HomeWorkspaceDestinationJson;
  displayOrder: number;
  isActive: boolean;
  updatedAt: string;
};

function asStringTriple(
  value: unknown,
  fallback: [string, string, string],
): [string, string, string] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [String(value[0]), String(value[1]), String(value[2])];
}

function asStringPair(value: unknown, fallback: [string, string]): [string, string] {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  return [String(value[0]), String(value[1])];
}

export function toHomeWorkspaceDestination(
  card: HomeWorkspaceCard,
): HomeWorkspaceDestinationJson {
  if (card.destinationType === "join") return { type: "join" };
  return { type: "create" };
}

export function toHomeWorkspaceCardJson(card: HomeWorkspaceCard): HomeWorkspaceCardJson {
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    body: card.body,
    actionLabel: card.actionLabel,
    accessibilityLabel: card.accessibilityLabel || card.actionLabel,
    imageUrl: card.imageUrl,
    imageAlt: card.imageAlt,
    surfaceColor: card.surfaceColor,
    fadeColors: asStringTriple(card.fadeColors, [
      card.surfaceColor,
      card.surfaceColor,
      "transparent",
    ]),
    borderColor: card.borderColor,
    titleColor: card.titleColor,
    bodyColor: card.bodyColor,
    buttonColors: asStringPair(card.buttonColors, ["#5B32D6", "#7C4DFF"]),
    destination: toHomeWorkspaceDestination(card),
    displayOrder: card.displayOrder,
    isActive: card.isActive,
    updatedAt: card.updatedAt.toISOString(),
  };
}
