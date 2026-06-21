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

/** ISO timestamps from AI → YYYY-MM-DD. */
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

export type SenecaCheckInQuestionType = "short_text" | "long_text" | "rating" | "yes_no";

export type SenecaCheckInTemplateQuestion = {
  label: string;
  type: SenecaCheckInQuestionType;
  helpText: string | null;
  required: boolean;
  ratingMax?: number;
};

export type SenecaCheckInTemplateSection = {
  title: string;
  questions: SenecaCheckInTemplateQuestion[];
};

export type SenecaCheckInTemplateDraft = {
  title: string;
  description: string | null;
  sections: SenecaCheckInTemplateSection[];
  leaderPrep: string[];
};

const CHECK_IN_QUESTION_TYPES = new Set<SenecaCheckInQuestionType>([
  "short_text",
  "long_text",
  "rating",
  "yes_no",
]);

const MAX_CHECK_IN_SECTIONS = 3;
const MAX_CHECK_IN_QUESTIONS = 10;
const MAX_LEADER_PREP = 8;

function normalizeCheckInQuestion(raw: unknown): SenecaCheckInTemplateQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!label) return null;
  const typeRaw = typeof o.type === "string" ? o.type.trim() : "long_text";
  const type = CHECK_IN_QUESTION_TYPES.has(typeRaw as SenecaCheckInQuestionType)
    ? (typeRaw as SenecaCheckInQuestionType)
    : "long_text";
  const helpText =
    typeof o.helpText === "string" && o.helpText.trim() ? o.helpText.trim() : null;
  const required = o.required === true;
  const ratingMax =
    type === "rating" && typeof o.ratingMax === "number" && o.ratingMax >= 2 && o.ratingMax <= 10
      ? Math.round(o.ratingMax)
      : type === "rating"
        ? 5
        : undefined;
  return { label, type, helpText, required, ...(ratingMax ? { ratingMax } : {}) };
}

export function normalizeCheckInTemplateDraft(raw: unknown): SenecaCheckInTemplateDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return null;

  const description =
    typeof o.description === "string" && o.description.trim() ? o.description.trim() : null;
  const leaderPrep = normalizeStringArray(o.leaderPrep).slice(0, MAX_LEADER_PREP);

  const sectionsRaw = Array.isArray(o.sections) ? o.sections : [];
  const sections: SenecaCheckInTemplateSection[] = [];
  let questionCount = 0;

  for (const sectionRaw of sectionsRaw.slice(0, MAX_CHECK_IN_SECTIONS)) {
    if (!sectionRaw || typeof sectionRaw !== "object") continue;
    const section = sectionRaw as Record<string, unknown>;
    const sectionTitle =
      (typeof section.title === "string" ? section.title.trim() : "") ||
      (typeof section.label === "string" ? section.label.trim() : "") ||
      "Check-in";
    const questionsRaw = Array.isArray(section.questions) ? section.questions : [];
    const questions: SenecaCheckInTemplateQuestion[] = [];
    for (const questionRaw of questionsRaw) {
      if (questionCount >= MAX_CHECK_IN_QUESTIONS) break;
      const question = normalizeCheckInQuestion(questionRaw);
      if (!question) continue;
      questions.push(question);
      questionCount += 1;
    }
    if (questions.length === 0) continue;
    sections.push({ title: sectionTitle, questions });
  }

  if (sections.length === 0) {
    const flatQuestions = normalizeStringArray(o.questions ?? o.fields).slice(0, MAX_CHECK_IN_QUESTIONS);
    if (flatQuestions.length === 0) return null;
    sections.push({
      title: "Check-in",
      questions: flatQuestions.map((label) => ({
        label,
        type: "long_text" as const,
        helpText: null,
        required: false,
      })),
    });
  }

  return { title, description, sections, leaderPrep };
}
