import type { OneOnOneTemplateField } from "./api";
import type { SenecaCheckInTemplateDraft } from "./seneca-normalize";

export function checkInTemplateDraftToFields(draft: SenecaCheckInTemplateDraft): OneOnOneTemplateField[] {
  const fields: OneOnOneTemplateField[] = [];
  let order = 0;

  for (const section of draft.sections) {
    fields.push({
      id: crypto.randomUUID(),
      label: section.title.trim() || "Check-in",
      type: "section",
      order: order++,
      required: false,
    });

    for (const question of section.questions) {
      fields.push({
        id: crypto.randomUUID(),
        label: question.label.trim(),
        type: question.type,
        order: order++,
        required: question.required,
        helpText: question.helpText,
        ...(question.type === "rating" ? { ratingMax: question.ratingMax ?? 5 } : {}),
      });
    }
  }

  return fields;
}

export function countCheckInTemplateQuestions(draft: SenecaCheckInTemplateDraft): number {
  return draft.sections.reduce((total, section) => total + section.questions.length, 0);
}
