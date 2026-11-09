import {
  appendLeaderCommentsIfMissing,
  LEADER_COMMENTS_SECTION_LABEL,
} from "./check-in-leader-comments";
import type {
  OneOnOneTemplate,
  OneOnOneTemplateField,
  OneOnOneTemplateFieldType,
} from "./member-profile-api";

export const CHECK_IN_TEMPLATE_MAX_PREP_ITEMS = 8;

export type EditableCheckInQuestionType =
  | "short_text"
  | "long_text"
  | "rating"
  | "yes_no";

export type CheckInTemplateQuestion = {
  id: string;
  label: string;
  type: EditableCheckInQuestionType;
  required: boolean;
  helpText: string;
  ratingMax: number;
};

export type CheckInTemplateSection = {
  id: string;
  title: string;
  questions: CheckInTemplateQuestion[];
};

export type CheckInTemplateDraft = {
  title: string;
  description: string;
  leaderPrep: string[];
  sections: CheckInTemplateSection[];
};

export type CheckInTemplatePayload = {
  title: string;
  description: string | null;
  leaderPrep: string[];
  fields: OneOnOneTemplateField[];
};

export type CheckInTemplateValidation = {
  valid: boolean;
  errors: string[];
};

const editableQuestionTypes = new Set<OneOnOneTemplateFieldType>([
  "short_text",
  "long_text",
  "rating",
  "yes_no",
]);

export function makeTemplateId(prefix = "field"): string {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

export function createEmptyQuestion(
  id = makeTemplateId("question"),
): CheckInTemplateQuestion {
  return {
    id,
    label: "",
    type: "short_text",
    required: false,
    helpText: "",
    ratingMax: 5,
  };
}

export function createEmptySection(
  id = makeTemplateId("section"),
  questionId = makeTemplateId("question"),
): CheckInTemplateSection {
  return {
    id,
    title: "",
    questions: [createEmptyQuestion(questionId)],
  };
}

export function createEmptyTemplateDraft(): CheckInTemplateDraft {
  return {
    title: "",
    description: "",
    leaderPrep: [],
    sections: [createEmptySection()],
  };
}

export function stripSystemLeaderComments(
  fields: OneOnOneTemplateField[],
): OneOnOneTemplateField[] {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const managerNoteIndexes = new Set<number>();
  sorted.forEach((field, index) => {
    if (field.type === "manager_notes") managerNoteIndexes.add(index);
  });

  const sectionIndexes = new Set<number>();
  for (const index of managerNoteIndexes) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const field = sorted[cursor];
      if (!field) break;
      if (field.type === "section") {
        if (field.label.trim().toLowerCase() === LEADER_COMMENTS_SECTION_LABEL.toLowerCase()) {
          sectionIndexes.add(cursor);
        }
        break;
      }
    }
  }

  return sorted
    .filter((_, index) => !managerNoteIndexes.has(index) && !sectionIndexes.has(index))
    .map((field, order) => ({ ...field, order }));
}

function questionFromField(field: OneOnOneTemplateField): CheckInTemplateQuestion | null {
  if (!editableQuestionTypes.has(field.type)) return null;
  return {
    id: field.id,
    label: field.label,
    type: field.type as EditableCheckInQuestionType,
    required: field.required ?? false,
    helpText: field.helpText ?? "",
    ratingMax: field.type === "rating" ? field.ratingMax ?? 5 : 5,
  };
}

export function fieldsToTemplateSections(
  fields: OneOnOneTemplateField[],
  idFactory: (prefix?: string) => string = makeTemplateId,
): CheckInTemplateSection[] {
  const editable = stripSystemLeaderComments(fields);
  const sections: CheckInTemplateSection[] = [];
  let current: CheckInTemplateSection | null = null;

  for (const field of editable) {
    if (field.type === "section") {
      current = { id: field.id, title: field.label, questions: [] };
      sections.push(current);
      continue;
    }
    const question = questionFromField(field);
    if (!question) continue;
    if (!current) {
      current = {
        id: idFactory("section"),
        title: "Conversation",
        questions: [],
      };
      sections.push(current);
    }
    current.questions.push(question);
  }

  return sections.length > 0 ? sections : [createEmptySection(idFactory("section"), idFactory("question"))];
}

export function templateToDraft(template: OneOnOneTemplate): CheckInTemplateDraft {
  return {
    title: template.title,
    description: template.description ?? "",
    leaderPrep: [...(template.leaderPrep ?? [])],
    sections: fieldsToTemplateSections(template.fields),
  };
}

export function ensureUniqueTemplateIds(
  sections: CheckInTemplateSection[],
  idFactory: (prefix?: string) => string = makeTemplateId,
): CheckInTemplateSection[] {
  const used = new Set<string>();
  const uniqueId = (candidate: string, prefix: string) => {
    let result = candidate;
    while (!result || used.has(result)) result = idFactory(prefix);
    used.add(result);
    return result;
  };

  return sections.map((section) => ({
    ...section,
    id: uniqueId(section.id, "section"),
    questions: section.questions.map((question) => ({
      ...question,
      id: uniqueId(question.id, "question"),
    })),
  }));
}

export function flattenTemplateSections(
  sections: CheckInTemplateSection[],
): OneOnOneTemplateField[] {
  const fields: OneOnOneTemplateField[] = [];
  let order = 0;
  for (const section of sections) {
    fields.push({
      id: section.id,
      label: section.title.trim(),
      type: "section",
      order: order++,
      required: false,
    });
    for (const question of section.questions) {
      fields.push({
        id: question.id,
        label: question.label.trim(),
        type: question.type,
        order: order++,
        required: question.required,
        helpText: question.helpText.trim() || null,
        ...(question.type === "rating"
          ? { ratingMax: Math.min(10, Math.max(2, Math.round(question.ratingMax))) }
          : {}),
      });
    }
  }
  return fields;
}

export function duplicateQuestion(
  question: CheckInTemplateQuestion,
  id = makeTemplateId("question"),
): CheckInTemplateQuestion {
  return { ...question, id, label: question.label ? `${question.label} copy` : "" };
}

export function duplicateSection(
  section: CheckInTemplateSection,
  idFactory: (prefix?: string) => string = makeTemplateId,
): CheckInTemplateSection {
  return {
    ...section,
    id: idFactory("section"),
    title: section.title ? `${section.title} copy` : "",
    questions: section.questions.map((question) =>
      duplicateQuestion(question, idFactory("question")),
    ),
  };
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    from === to
  ) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function validateCheckInTemplateDraft(
  draft: CheckInTemplateDraft,
): CheckInTemplateValidation {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("Template name is required.");
  if (draft.title.trim().length > 120) errors.push("Template name must be 120 characters or fewer.");
  if (draft.description.trim().length > 500) {
    errors.push("Description must be 500 characters or fewer.");
  }
  if (draft.leaderPrep.length > CHECK_IN_TEMPLATE_MAX_PREP_ITEMS) {
    errors.push(`Leader prep is limited to ${CHECK_IN_TEMPLATE_MAX_PREP_ITEMS} items.`);
  }
  draft.leaderPrep.forEach((item, index) => {
    if (!item.trim()) errors.push(`Leader prep item ${index + 1} cannot be empty.`);
    if (item.trim().length > 200) {
      errors.push(`Leader prep item ${index + 1} must be 200 characters or fewer.`);
    }
  });
  if (draft.sections.length === 0) errors.push("Add at least one section.");
  let questionCount = 0;
  draft.sections.forEach((section, sectionIndex) => {
    if (!section.title.trim()) errors.push(`Section ${sectionIndex + 1} needs a title.`);
    for (const question of section.questions) {
      questionCount += 1;
      if (!question.label.trim()) {
        errors.push(`Every question in section ${sectionIndex + 1} needs a label.`);
      }
      if (question.type === "rating" && (question.ratingMax < 2 || question.ratingMax > 10)) {
        errors.push("Rating maximum must be between 2 and 10.");
      }
    }
  });
  if (questionCount === 0) errors.push("Add at least one question.");
  return { valid: errors.length === 0, errors };
}

export function buildCheckInTemplatePayload(
  draft: CheckInTemplateDraft,
  idFactory: (prefix?: string) => string = makeTemplateId,
): CheckInTemplatePayload {
  const uniqueSections = ensureUniqueTemplateIds(draft.sections, idFactory);
  const normalizedFields = flattenTemplateSections(uniqueSections);
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    leaderPrep: draft.leaderPrep.map((item) => item.trim()).filter(Boolean),
    fields: appendLeaderCommentsIfMissing(normalizedFields),
  };
}

export function countTemplateQuestions(fields: OneOnOneTemplateField[]): number {
  return stripSystemLeaderComments(fields).filter((field) =>
    editableQuestionTypes.has(field.type),
  ).length;
}
