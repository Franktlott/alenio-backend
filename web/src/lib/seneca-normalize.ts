/** OpenAI sometimes returns a string instead of string[] — coerce safely. */
export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    if (value.includes("\n")) {
      return value.split("\n").map((s) => s.trim()).filter(Boolean);
    }
    if (value.includes(";")) {
      return value.split(";").map((s) => s.trim()).filter(Boolean);
    }
    return [value.trim()];
  }
  return [];
}

/** ISO timestamps from AI → YYYY-MM-DD for date inputs. */
export function normalizeTargetDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly && trimmed.length <= 10) return dateOnly[1]!;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return dateOnly?.[1] ?? null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Human-readable label for saved goal steps. */
export function formatSenecaTargetDate(value: string): string {
  const normalized = normalizeTargetDate(value);
  if (!normalized) return value;
  const d = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(d.getTime())) return normalized;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type SenecaDevelopmentGoalDraftNormalized = {
  goalTitle: string;
  focusArea: string;
  actionSteps30Day: string[];
  managerSupportNeeded: string[];
  successMeasures: string[];
  targetDate: string | null;
};

export function normalizeDevelopmentGoalDraft(raw: unknown): SenecaDevelopmentGoalDraftNormalized | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const goalTitle = typeof o.goalTitle === "string" ? o.goalTitle.trim() : "";
  if (!goalTitle) return null;
  return {
    goalTitle,
    focusArea: typeof o.focusArea === "string" ? o.focusArea.trim() : "",
    actionSteps30Day: normalizeStringArray(o.actionSteps30Day),
    managerSupportNeeded: normalizeStringArray(o.managerSupportNeeded),
    successMeasures: normalizeStringArray(o.successMeasures),
    targetDate: normalizeTargetDate(o.targetDate),
  };
}

export type SenecaQuickDevelopmentGoal = {
  skill: string;
  steps: string[];
};

const MAX_QUICK_GOAL_STEPS = 5;

export function normalizeQuickDevelopmentGoal(raw: unknown): SenecaQuickDevelopmentGoal | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const skill =
    (typeof o.skill === "string" ? o.skill.trim() : "") ||
    (typeof o.goalTitle === "string" ? o.goalTitle.trim() : "");
  if (!skill) return null;
  const steps = normalizeStringArray(o.steps ?? o.actionSteps30Day).slice(0, MAX_QUICK_GOAL_STEPS);
  if (steps.length === 0) return null;
  return { skill, steps };
}
