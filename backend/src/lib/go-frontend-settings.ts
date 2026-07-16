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
  /** Override kiosk hero/header image. Null uses the workspace photo. */
  heroImageUrl: string | null;
  /** Floor-device quick actions (max 5, one row). Null or [] = none on floor. */
  quickActions: GoFrontendQuickAction[] | null;
};

export const MAX_GO_FLOOR_QUICK_ACTIONS = 5;

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

function parseUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function parseTone(value: unknown): GoFrontendQuickActionTone {
  return typeof value === "string" && TONES.has(value as GoFrontendQuickActionTone)
    ? (value as GoFrontendQuickActionTone)
    : "indigo";
}

function parseIcon(value: unknown): GoFrontendQuickActionIcon {
  return typeof value === "string" && ICONS.has(value as GoFrontendQuickActionIcon)
    ? (value as GoFrontendQuickActionIcon)
    : "more";
}

export function normalizeGoQuickActions(
  value: unknown,
): GoFrontendQuickAction[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const out: GoFrontendQuickAction[] = [];
  for (const raw of value.slice(0, MAX_GO_FLOOR_QUICK_ACTIONS)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<GoFrontendQuickAction>;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `qa-${out.length + 1}`;
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim().slice(0, 40) : "Quick action";
    const href =
      typeof row.href === "string" && row.href.trim() ? row.href.trim().slice(0, 200) : undefined;
    out.push({
      id,
      label,
      active: row.active !== false,
      tone: parseTone(row.tone),
      icon: parseIcon(row.icon),
      ...(href ? { href } : {}),
    });
  }
  return out.length > 0 ? out : [];
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

export function parseGoFrontendSettings(raw: string | null | undefined): GoFrontendSettings {
  if (!raw) return { ...DEFAULT_GO_FRONTEND_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<GoFrontendSettings>;
    return {
      heroImageUrl: parseUrl(parsed.heroImageUrl),
      quickActions: normalizeGoQuickActions(parsed.quickActions),
    };
  } catch {
    return { ...DEFAULT_GO_FRONTEND_SETTINGS };
  }
}

export function serializeGoFrontendSettings(settings: GoFrontendSettings): string | null {
  const hero = settings.heroImageUrl?.trim() || null;
  const quickActions = settings.quickActions;
  if (!hero && (quickActions == null || quickActions.length === 0)) {
    // Empty array is intentional (admin cleared all); still persist it.
    if (quickActions && quickActions.length === 0) {
      return JSON.stringify({ heroImageUrl: null, quickActions: [] });
    }
    return null;
  }
  return JSON.stringify({
    heroImageUrl: hero,
    quickActions: quickActions ?? null,
  });
}

export function parseGoFrontendSettingsPatch(
  body: unknown,
  current: GoFrontendSettings = DEFAULT_GO_FRONTEND_SETTINGS,
): { ok: true; value: GoFrontendSettings } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid Alenio Go frontend settings payload" };
  }
  const input = body as Partial<GoFrontendSettings>;
  const next: GoFrontendSettings = {
    heroImageUrl: current.heroImageUrl,
    quickActions: current.quickActions,
  };

  if ("heroImageUrl" in input) {
    if (input.heroImageUrl !== undefined && input.heroImageUrl !== null) {
      if (typeof input.heroImageUrl !== "string" || !input.heroImageUrl.trim()) {
        return { ok: false, message: "Header image must be a valid URL or null" };
      }
      next.heroImageUrl = input.heroImageUrl.trim();
    } else {
      next.heroImageUrl = null;
    }
  }

  if ("quickActions" in input) {
    if (input.quickActions === null) {
      next.quickActions = null;
    } else if (Array.isArray(input.quickActions)) {
      if (input.quickActions.length > MAX_GO_FLOOR_QUICK_ACTIONS) {
        return { ok: false, message: `At most ${MAX_GO_FLOOR_QUICK_ACTIONS} quick actions are allowed` };
      }
      next.quickActions = normalizeGoQuickActions(input.quickActions) ?? [];
    } else {
      return { ok: false, message: "Quick actions must be an array or null" };
    }
  }

  return { ok: true, value: next };
}

export function resolveGoHeroImage(
  teamImage: string | null | undefined,
  settings: GoFrontendSettings,
): string | null {
  const override = settings.heroImageUrl?.trim();
  if (override) return override;
  const workspace = teamImage?.trim();
  return workspace || null;
}
