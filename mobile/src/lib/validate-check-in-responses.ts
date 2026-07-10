import type { OneOnOneTemplateField } from "./member-profile-api";

function isAssociateRequestedField(field: OneOnOneTemplateField): boolean {
  return field.associateRequest === "task" || field.associateRequest === "message";
}

export type CheckInValidationError = {
  message: string;
  fieldId: string;
};

export function validateCheckInResponses(
  fields: OneOnOneTemplateField[],
  responses: Record<string, string | number | undefined>,
  options?: { draft?: boolean },
): CheckInValidationError | null {
  const draft = options?.draft === true;

  for (const field of fields) {
    if (field.type === "section" || field.type === "associate_notes") continue;
    if (isAssociateRequestedField(field)) continue;

    const value = responses[field.id];

    if (field.required && !draft) {
      if (field.type === "rating") {
        const num = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(num) || num < 1) {
          return { message: `${field.label} is required.`, fieldId: field.id };
        }
      } else if (value === undefined || value === null || String(value).trim() === "") {
        return { message: `${field.label} is required.`, fieldId: field.id };
      }
    }

    if (field.type === "rating" && value !== undefined && value !== "") {
      const num = typeof value === "number" ? value : Number(value);
      const max = field.ratingMax ?? 5;
      if (!Number.isFinite(num) || num < 1 || num > max) {
        return { message: `${field.label} must be between 1 and ${max}.`, fieldId: field.id };
      }
    }

    if (field.type === "yes_no" && value !== undefined && value !== "") {
      const answer = String(value).toLowerCase();
      if (answer !== "yes" && answer !== "no") {
        return { message: `${field.label} must be Yes or No.`, fieldId: field.id };
      }
    }
  }

  return null;
}
