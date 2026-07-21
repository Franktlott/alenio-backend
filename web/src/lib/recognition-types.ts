export const RECOGNITION_TYPES = [
  {
    key: "leadership",
    label: "Great leadership",
    color: "#D97706",
    bg: "#FFFBEB",
    icon: "★",
  },
  {
    key: "customer_service",
    label: "Customer service",
    color: "#E11D48",
    bg: "#FFF1F2",
    icon: "♥",
  },
  {
    key: "teamwork",
    label: "Teamwork",
    color: "#2563EB",
    bg: "#EFF6FF",
    icon: "👥",
  },
  {
    key: "operational_excellence",
    label: "Operational excellence",
    color: "#0F766E",
    bg: "#F0FDFA",
    icon: "⚙",
  },
  {
    key: "beyond",
    label: "Above and beyond",
    color: "#7C3AED",
    bg: "#F5F3FF",
    icon: "🚀",
  },
] as const;

export type RecognitionTypeKey = (typeof RECOGNITION_TYPES)[number]["key"];

const LEGACY_CELEBRATION_LABELS: Record<string, string> = {
  shoutout: "Shoutout",
  mvp: "MVP",
  rockstar: "Rockstar",
  clutch: "Clutch",
  teamplayer: "Team Player",
  bigbrain: "Big Brain",
  onfire: "On Fire",
  milestone: "Milestone",
  grateful: "Grateful",
};

export function isRecognitionTypeKey(value: string): value is RecognitionTypeKey {
  return RECOGNITION_TYPES.some((t) => t.key === value);
}

/** Map Chat Activity celebration keys onto Recognition’s five types for analytics. */
export function normalizeRecognitionType(value: string): RecognitionTypeKey | "other" {
  if (isRecognitionTypeKey(value)) return value;
  const legacy: Record<string, RecognitionTypeKey> = {
    beyond: "beyond",
    teamplayer: "teamwork",
    mvp: "leadership",
    rockstar: "leadership",
    clutch: "leadership",
    onfire: "beyond",
    shoutout: "customer_service",
    grateful: "teamwork",
    bigbrain: "operational_excellence",
    milestone: "leadership",
  };
  return legacy[value] ?? "other";
}

export function recognitionTypeMeta(key: string) {
  const found = RECOGNITION_TYPES.find((t) => t.key === key);
  if (found) return found;
  const legacy = LEGACY_CELEBRATION_LABELS[key];
  return {
    key,
    label: legacy ?? (key === "other" ? "Other" : key.replace(/_/g, " ")),
    color: "#64748B",
    bg: "#F1F5F9",
    icon: "•",
  };
}

export function formatRecognitionDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatPctChange(pct: number | null | undefined): string | null {
  if (pct == null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}
