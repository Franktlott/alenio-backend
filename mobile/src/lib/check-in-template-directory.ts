import { countTemplateQuestions } from "@/lib/check-in-template-editor";
import type {
  CheckInLibraryTemplate,
  CheckInTemplate,
} from "@/lib/check-in-templates-api";

export type CheckInTemplateSort = "recent" | "name" | "questions";

export const CHECK_IN_LIBRARY_CATEGORIES = [
  "All",
  "Coaching",
  "Development",
  "Onboarding",
] as const;

export type CheckInLibraryCategoryFilter =
  (typeof CHECK_IN_LIBRARY_CATEGORIES)[number];

export type CheckInLibraryCategory =
  | "Coaching"
  | "Development"
  | "Onboarding"
  | "Team";

const LIBRARY_CATEGORY_BY_KEY: Record<string, CheckInLibraryCategory> = {
  "coaching-conversation": "Coaching",
  "feedback-conversation": "Coaching",
  "performance-check-in": "Coaching",
  "development-check-in": "Development",
  "career-conversation": "Development",
  "goal-check-in": "Development",
  "new-hire-30-60-90": "Onboarding",
  "first-week-check-in": "Onboarding",
  "training-check-in": "Onboarding",
  "weekly-check-in": "Team",
  "monthly-check-in": "Team",
  "return-check-in": "Team",
};

const LIBRARY_DESCRIPTION_BY_KEY: Record<string, string> = {
  "new-hire-30-60-90":
    "Build a consistent onboarding experience for new hires.",
};

export const CHECK_IN_TEMPLATE_SORT_LABELS: Record<CheckInTemplateSort, string> =
  {
    recent: "Recently updated",
    name: "Name A–Z",
    questions: "Most questions",
  };

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matches(
  query: string,
  fields: Array<string | null | undefined>,
): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return fields.some((field) => normalize(field).includes(needle));
}

export function filterCheckInTemplates(
  templates: readonly CheckInTemplate[],
  query: string,
): CheckInTemplate[] {
  return templates.filter((template) =>
    matches(query, [template.title, template.description]),
  );
}

export function checkInLibraryCategory(template: {
  key: string;
}): CheckInLibraryCategory {
  return LIBRARY_CATEGORY_BY_KEY[template.key] ?? "Team";
}

export function checkInLibraryDescription(
  template: CheckInLibraryTemplate,
): string | null {
  return LIBRARY_DESCRIPTION_BY_KEY[template.key] ?? template.description;
}

export function filterCheckInLibraryByCategory(
  library: readonly CheckInLibraryTemplate[],
  category: CheckInLibraryCategoryFilter,
): CheckInLibraryTemplate[] {
  if (category === "All") return [...library];
  return library.filter(
    (template) => checkInLibraryCategory(template) === category,
  );
}

export function filterCheckInLibrary(
  library: readonly CheckInLibraryTemplate[],
  query: string,
): CheckInLibraryTemplate[] {
  return library.filter((template) =>
    matches(query, [template.title, template.description]),
  );
}

function updatedAtMs(template: CheckInTemplate): number {
  const time = new Date(template.updatedAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function byTitle(a: { title: string }, b: { title: string }): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

export function sortCheckInTemplates(
  templates: readonly CheckInTemplate[],
  sort: CheckInTemplateSort,
): CheckInTemplate[] {
  const list = [...templates];
  if (sort === "name") return list.sort(byTitle);
  if (sort === "questions") {
    return list.sort((a, b) => {
      const diff =
        countTemplateQuestions(b.fields) - countTemplateQuestions(a.fields);
      return diff !== 0 ? diff : byTitle(a, b);
    });
  }
  return list.sort((a, b) => {
    const diff = updatedAtMs(b) - updatedAtMs(a);
    return diff !== 0 ? diff : byTitle(a, b);
  });
}

/** The library has no timestamps, so "recent" falls back to name order. */
export function sortCheckInLibrary(
  library: readonly CheckInLibraryTemplate[],
  sort: CheckInTemplateSort,
): CheckInLibraryTemplate[] {
  const list = [...library];
  if (sort === "questions") {
    return list.sort((a, b) => {
      const diff =
        countTemplateQuestions(b.fields) - countTemplateQuestions(a.fields);
      return diff !== 0 ? diff : byTitle(a, b);
    });
  }
  return list.sort(byTitle);
}
