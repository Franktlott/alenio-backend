export type GoFrontendQuickActionTone = "indigo" | "emerald" | "violet" | "amber" | "slate";
export type GoFrontendQuickActionIcon = "camera" | "note" | "temp" | "history" | "more" | "check" | "alert";

export type GoFrontendQuickAction = {
  id: string;
  label: string;
  active: boolean;
  tone: GoFrontendQuickActionTone;
  icon: GoFrontendQuickActionIcon;
  href?: string;
};

export type GoFrontendSettings = {
  heroImageUrl: string | null;
  /** Floor-device quick actions (max 5, one row). Null or [] = none on floor. */
  quickActions: GoFrontendQuickAction[] | null;
};

/** Max quick actions on the Alenio Go floor display (single row). */
export const MAX_GO_FLOOR_QUICK_ACTIONS = 5;

/** Max quick-action cards on the enterprise console dock (4 across, wrapping). */
export const MAX_GO_CONSOLE_QUICK_ACTIONS = 16;

/** @deprecated Use MAX_GO_FLOOR_QUICK_ACTIONS */
export const MAX_GO_QUICK_ACTIONS = MAX_GO_FLOOR_QUICK_ACTIONS;

export const DEFAULT_GO_QUICK_ACTIONS: GoFrontendQuickAction[] = [
  { id: "photo", label: "Add Photo", active: false, tone: "indigo", icon: "camera" },
  { id: "note", label: "Add Note", active: false, tone: "emerald", icon: "note" },
  { id: "temp", label: "Temp Check", active: false, tone: "violet", icon: "temp" },
  { id: "history", label: "View History", active: false, tone: "amber", icon: "history" },
  { id: "more", label: "More", active: false, tone: "slate", icon: "more" },
];

export const DEFAULT_GO_FRONTEND_SETTINGS: GoFrontendSettings = {
  heroImageUrl: null,
  quickActions: null,
};

const TONES = new Set<GoFrontendQuickActionTone>(["indigo", "emerald", "violet", "amber", "slate"]);
const ICONS = new Set<GoFrontendQuickActionIcon>([
  "camera",
  "note",
  "temp",
  "history",
  "more",
  "check",
  "alert",
]);

function parseTone(value: string | undefined): GoFrontendQuickActionTone {
  return value && TONES.has(value as GoFrontendQuickActionTone)
    ? (value as GoFrontendQuickActionTone)
    : "indigo";
}

function parseIcon(value: string | undefined): GoFrontendQuickActionIcon {
  return value && ICONS.has(value as GoFrontendQuickActionIcon)
    ? (value as GoFrontendQuickActionIcon)
    : "more";
}

export function normalizeGoQuickActions(
  value: GoFrontendQuickAction[] | null | undefined,
): GoFrontendQuickAction[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value.slice(0, MAX_GO_FLOOR_QUICK_ACTIONS).map((row, index) => ({
    id: row.id?.trim() || `qa-${index + 1}`,
    label: (row.label?.trim() || "Quick action").slice(0, 40),
    active: row.active !== false,
    tone: parseTone(row.tone),
    icon: parseIcon(row.icon),
    ...(row.href?.trim() ? { href: row.href.trim().slice(0, 200) } : {}),
  }));
}

/** Floor-device actions. Null or empty settings → no actions on the floor display. */
export function resolveGoQuickActions(
  settings: GoFrontendSettings | null | undefined,
): GoFrontendQuickAction[] {
  if (!settings?.quickActions || settings.quickActions.length === 0) {
    return [];
  }
  return settings.quickActions.slice(0, MAX_GO_FLOOR_QUICK_ACTIONS);
}

export function resolveGoHeroImage(
  teamImage: string | null | undefined,
  settings: GoFrontendSettings | null | undefined,
): string | null {
  const override = settings?.heroImageUrl?.trim();
  if (override) return override;
  const workspace = teamImage?.trim();
  return workspace || null;
}

export function isUsingWorkspaceHeroImage(settings: GoFrontendSettings | null | undefined): boolean {
  return !settings?.heroImageUrl?.trim();
}

function quickActionsKey(actions: GoFrontendQuickAction[] | null | undefined): string {
  if (actions == null) return "null";
  return JSON.stringify(actions);
}

export function goFrontendSettingsEqual(
  a: GoFrontendSettings | null | undefined,
  b: GoFrontendSettings | null | undefined,
): boolean {
  const heroA = a?.heroImageUrl?.trim() || null;
  const heroB = b?.heroImageUrl?.trim() || null;
  return heroA === heroB && quickActionsKey(a?.quickActions) === quickActionsKey(b?.quickActions);
}

export function normalizeGoFrontendSettings(
  settings: Partial<GoFrontendSettings> | null | undefined,
): GoFrontendSettings {
  return {
    heroImageUrl: settings?.heroImageUrl?.trim() || null,
    quickActions: normalizeGoQuickActions(settings?.quickActions ?? null),
  };
}

export const QUICK_ACTION_CATALOG: Array<{
  id: string;
  label: string;
  tone: GoFrontendQuickActionTone;
  icon: GoFrontendQuickActionIcon;
}> = [
  { id: "photo", label: "Add Photo", tone: "indigo", icon: "camera" },
  { id: "note", label: "Add Note", tone: "emerald", icon: "note" },
  { id: "temp", label: "Temp Check", tone: "violet", icon: "temp" },
  { id: "history", label: "View History", tone: "amber", icon: "history" },
  { id: "check", label: "Checklist", tone: "emerald", icon: "check" },
  { id: "alert", label: "Send Alert", tone: "amber", icon: "alert" },
  { id: "more", label: "More", tone: "slate", icon: "more" },
];
