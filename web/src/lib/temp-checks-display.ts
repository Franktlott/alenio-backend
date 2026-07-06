import type { TempCheckActionType, TempCheckTemplateRow } from "./api";

export type { TempCheckActionType };

export type TempCheckBranchAction = {
  label: string;
  actionType: TempCheckActionType;
  checklistItems: string[];
  requireInitials: boolean;
  requireNote: boolean;
  requirePhoto: boolean;
};

export type TempCheckCorrectiveActionInput = string | TempCheckBranchAction;

function parseChecklistItems(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of raw) {
    const label = row.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length >= 20) break;
  }
  return out;
}

export function normalizeBranchAction(
  action: TempCheckCorrectiveActionInput,
  defaultType: TempCheckActionType = "close",
): TempCheckBranchAction {
  if (typeof action === "string") {
    return {
      label: action.trim(),
      actionType: defaultType,
      checklistItems: [],
      requireInitials: false,
      requireNote: false,
      requirePhoto: false,
    };
  }
  return {
    label: action.label.trim(),
    actionType: action.actionType === "retemp" ? "retemp" : "close",
    checklistItems: parseChecklistItems(action.checklistItems),
    requireInitials: false,
    requireNote: action.requireNote === true,
    requirePhoto: action.requirePhoto === true,
  };
}

export function normalizeBranchActions(
  actions: TempCheckCorrectiveActionInput[] | undefined,
  defaultType: TempCheckActionType = "close",
): TempCheckBranchAction[] {
  if (!actions?.length) return [];
  const seen = new Set<string>();
  const out: TempCheckBranchAction[] = [];
  for (const row of actions) {
    const normalized = normalizeBranchAction(row, defaultType);
    if (!normalized.label || seen.has(normalized.label.toLowerCase())) continue;
    seen.add(normalized.label.toLowerCase());
    out.push(normalized);
    if (out.length >= 12) break;
  }
  return out;
}

export function hasCloseBranchAction(actions: TempCheckBranchAction[]): boolean {
  return actions.some((action) => action.actionType === "close");
}

export const RECHECK_BRANCH_LABEL = "Recheck";

export function extractCorrectiveSteps(actions: TempCheckBranchAction[]): string[] {
  const retemp = actions.find((action) => action.actionType === "retemp");
  return retemp?.checklistItems ?? [];
}

export function buildRecheckBranchActions(steps: string[]): TempCheckBranchAction[] {
  const checklistItems = parseChecklistItems(steps);
  if (checklistItems.length === 0) return [];
  return [
    {
      label: RECHECK_BRANCH_LABEL,
      actionType: "retemp",
      checklistItems,
      requireInitials: false,
      requireNote: false,
      requirePhoto: false,
    },
  ];
}

export function hasCorrectiveStepsForRecheck(actions: TempCheckBranchAction[]): boolean {
  return extractCorrectiveSteps(actions).length > 0;
}

export type OutOfRangeActionPreset = {
  id: string;
  label: string;
  description: string;
  actionType: TempCheckActionType;
  defaults: Pick<TempCheckBranchAction, "requireInitials" | "requireNote" | "requirePhoto">;
};

/** Standard out-of-range options admins can enable for leaders. */
export const OUT_OF_RANGE_ACTION_PRESETS: OutOfRangeActionPreset[] = [
  {
    id: "correct-and-recheck",
    label: "Corrective Action and Recheck",
    description: "Leader takes corrective action, then takes a new reading.",
    actionType: "retemp",
    defaults: { requireInitials: false, requireNote: false, requirePhoto: false },
  },
  {
    id: "correct-and-close",
    label: "Corrective Action and Close",
    description: "Leader takes corrective action and completes the item.",
    actionType: "close",
    defaults: { requireInitials: false, requireNote: false, requirePhoto: false },
  },
  {
    id: "product-discarded",
    label: "Product Discarded",
    description: "Product is removed and the item is closed.",
    actionType: "close",
    defaults: { requireInitials: false, requireNote: true, requirePhoto: true },
  },
];

const PRESET_LEGACY_LABELS: Record<string, string[]> = {
  "correct-and-recheck": ["correct and recheck"],
  "correct-and-close": ["correct and close"],
};

function labelMatchesPreset(actionLabel: string, preset: OutOfRangeActionPreset): boolean {
  const normalized = actionLabel.trim().toLowerCase();
  if (normalized === preset.label.toLowerCase()) return true;
  return PRESET_LEGACY_LABELS[preset.id]?.some((legacy) => legacy === normalized) ?? false;
}

export function findPresetForActionLabel(label: string): OutOfRangeActionPreset | undefined {
  return OUT_OF_RANGE_ACTION_PRESETS.find((preset) => labelMatchesPreset(label, preset));
}

export function isKnownPresetAction(action: Pick<TempCheckBranchAction, "label">): boolean {
  return !!findPresetForActionLabel(action.label);
}

export function migrateLegacyPresetActionLabel(action: TempCheckBranchAction): TempCheckBranchAction {
  const preset = findPresetForActionLabel(action.label);
  if (!preset || action.label === preset.label) return action;
  return { ...action, label: preset.label };
}

export function findActionByPresetLabel(
  actions: TempCheckBranchAction[],
  preset: OutOfRangeActionPreset,
): TempCheckBranchAction | undefined {
  return actions.find((action) => labelMatchesPreset(action.label, preset));
}

export function isPresetEnabled(actions: TempCheckBranchAction[], preset: OutOfRangeActionPreset): boolean {
  return !!findActionByPresetLabel(actions, preset);
}

export function togglePresetAction(
  actions: TempCheckBranchAction[],
  preset: OutOfRangeActionPreset,
  enabled: boolean,
): TempCheckBranchAction[] {
  const existingIndex = actions.findIndex((action) => labelMatchesPreset(action.label, preset));
  if (enabled) {
    if (existingIndex >= 0) {
      const existing = actions[existingIndex];
      if (existing.label !== preset.label) {
        return actions.map((action, index) =>
          index === existingIndex ? { ...action, label: preset.label } : action,
        );
      }
      return actions;
    }
    return [
      ...actions,
      {
        label: preset.label,
        actionType: preset.actionType,
        checklistItems: [],
        requireInitials: false,
        requireNote: preset.defaults.requireNote,
        requirePhoto: preset.defaults.requirePhoto,
      },
    ];
  }
  if (existingIndex < 0) return actions;
  return actions.filter((_, index) => index !== existingIndex);
}

export function updatePresetAction(
  actions: TempCheckBranchAction[],
  preset: OutOfRangeActionPreset,
  patch: Partial<TempCheckBranchAction>,
): TempCheckBranchAction[] {
  return actions.map((action) =>
    labelMatchesPreset(action.label, preset)
      ? { ...action, ...patch, label: preset.label, requireInitials: false }
      : action,
  );
}

export function formatBranchActionType(actionType: TempCheckActionType): string {
  return actionType === "retemp" ? "Retake temperature" : "Complete item";
}

export function summarizeCorrectiveRequirements(action: TempCheckBranchAction): string {
  if (action.actionType === "retemp") {
    return "Retake temperature";
  }
  const reqs: string[] = [];
  if (action.requireNote) reqs.push("note");
  if (action.requirePhoto) reqs.push("photo");
  return reqs.length > 0 ? reqs.join(", ") : "No extra requirements";
}

export function formatTempCheckTime(value: string): string {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatTempRange(tempMinF: number | null, tempMaxF: number | null): string {
  if (tempMinF != null && tempMaxF != null) return `${tempMinF}°F – ${tempMaxF}°F`;
  if (tempMinF != null) return `≥ ${tempMinF}°F`;
  if (tempMaxF != null) return `≤ ${tempMaxF}°F`;
  return "Any temperature";
}

export function formatTempCheckWindow(template: Pick<TempCheckTemplateRow, "windowStartLocal" | "windowEndLocal">): string {
  return `${formatTempCheckTime(template.windowStartLocal)} – ${formatTempCheckTime(template.windowEndLocal)}`;
}

export function formatTempCheckSchedule(template: Pick<TempCheckTemplateRow, "dueTimeLocal" | "windowStartLocal" | "windowEndLocal">): string {
  return `Due ${formatTempCheckTime(template.dueTimeLocal)} · Window ${formatTempCheckWindow(template)}`;
}

export function formatTempCheckSaveError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    if (err.message.includes("Not found")) {
      return "Could not reach the equipment API yet. Wait a minute for the server to update, then try Save again.";
    }
    if (err.message.includes("DB_NOT_READY") || err.message.includes("database tables")) {
      return err.message;
    }
    if (err.message.includes("Could not complete request")) {
      return "Something went wrong saving equipment. Try again in a moment.";
    }
    return err.message;
  }
  return "Could not save temp check. Please review the form and try again.";
}

function localTimeToMinutes(value: string): number {
  const [hourRaw, minuteRaw] = value.split(":");
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

export function getKioskTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz?.trim()) return tz;
  } catch {
    /* use fallback */
  }
  return "America/New_York";
}

export function isTempCheckWindowOpen(
  template: Pick<TempCheckTemplateRow, "windowStartLocal" | "windowEndLocal">,
  at = new Date(),
  timeZone = getKioskTimeZone(),
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const nowMinutes = hour * 60 + minute;
  const start = localTimeToMinutes(template.windowStartLocal);
  const end = localTimeToMinutes(template.windowEndLocal);
  if (start <= end) return nowMinutes >= start && nowMinutes <= end;
  return nowMinutes >= start || nowMinutes <= end;
}

export function formatTempCheckDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isReadingInTempRange(readingF: number, tempMinF: number | null, tempMaxF: number | null): boolean {
  if (tempMinF != null && readingF < tempMinF) return false;
  if (tempMaxF != null && readingF > tempMaxF) return false;
  return true;
}
