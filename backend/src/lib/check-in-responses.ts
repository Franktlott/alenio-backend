import {
  isAssociateRequestedField,
  type OneOnOneTemplateFieldLike,
} from "./one-on-one-feedback";

export type CheckInTemplateField = OneOnOneTemplateFieldLike & {
  order: number;
  ratingMax?: number;
};

export function parseTemplateFields(raw: string): CheckInTemplateField[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CheckInTemplateField[]) : [];
  } catch {
    return [];
  }
}

export function parseCheckInResponses(raw: string): Record<string, string | number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string | number>;
  } catch {
    return {};
  }
}

/**
 * Returns the first problem with a set of answers, or null when they can be
 * saved. Drafts skip required-field checks but still reject out-of-range
 * ratings and non yes/no answers.
 */
export function validateCheckInResponses(
  fields: CheckInTemplateField[],
  responses: Record<string, string | number>,
  options?: { draft?: boolean },
): string | null {
  const draft = options?.draft === true;
  for (const field of fields) {
    if (field.type === "section" || field.type === "associate_notes") continue;
    if (isAssociateRequestedField(field)) continue;
    const value = responses[field.id];
    if (field.required && !draft) {
      if (field.type === "rating") {
        const num = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(num) || num < 1) {
          return `${field.label} is required.`;
        }
      } else if (value === undefined || value === null || String(value).trim() === "") {
        return `${field.label} is required.`;
      }
    }
    if (field.type === "rating" && value !== undefined && value !== "") {
      const num = typeof value === "number" ? value : Number(value);
      const max = field.ratingMax ?? 5;
      if (!Number.isFinite(num) || num < 1 || num > max) {
        return `${field.label} must be between 1 and ${max}.`;
      }
    }
    if (field.type === "yes_no" && value !== undefined && value !== "") {
      const answer = String(value).toLowerCase();
      if (answer !== "yes" && answer !== "no") {
        return `${field.label} must be Yes or No.`;
      }
    }
  }
  return null;
}
