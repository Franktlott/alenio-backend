import { describe, expect, test } from "bun:test";
import type { OneOnOneTemplateField } from "./member-profile-api";
import {
  buildCheckInTemplatePayload,
  duplicateSection,
  ensureUniqueTemplateIds,
  fieldsToTemplateSections,
  flattenTemplateSections,
  moveItem,
  stripSystemLeaderComments,
  validateCheckInTemplateDraft,
  type CheckInTemplateDraft,
} from "./check-in-template-editor";

const fields: OneOnOneTemplateField[] = [
  { id: "section-1", label: "Progress", type: "section", order: 8 },
  {
    id: "question-1",
    label: "What went well?",
    type: "long_text",
    order: 9,
    required: true,
  },
  { id: "leader-section", label: "Leader comments", type: "section", order: 10 },
  {
    id: "leader-notes",
    label: "Summary & commitments",
    type: "manager_notes",
    order: 11,
  },
];

function validDraft(): CheckInTemplateDraft {
  return {
    title: "Weekly check-in",
    description: "A focused conversation",
    leaderPrep: ["Review last week's commitments"],
    sections: [
      {
        id: "section-1",
        title: "Progress",
        questions: [
          {
            id: "question-1",
            label: "What went well?",
            type: "rating",
            required: true,
            helpText: "Think about the whole week.",
            ratingMax: 12,
          },
        ],
      },
    ],
  };
}

describe("check-in template sections", () => {
  test("strips system leader comments and groups editable fields", () => {
    expect(stripSystemLeaderComments(fields).map((field) => field.id)).toEqual([
      "section-1",
      "question-1",
    ]);
    expect(fieldsToTemplateSections(fields)).toEqual([
      {
        id: "section-1",
        title: "Progress",
        questions: [
          {
            id: "question-1",
            label: "What went well?",
            type: "long_text",
            required: true,
            helpText: "",
            ratingMax: 5,
          },
        ],
      },
    ]);
  });

  test("flattens sections with normalized sequential ordering", () => {
    const flattened = flattenTemplateSections(validDraft().sections);
    expect(flattened.map((field) => field.order)).toEqual([0, 1]);
    expect(flattened[1]).toMatchObject({
      id: "question-1",
      ratingMax: 10,
      helpText: "Think about the whole week.",
    });
  });

  test("replaces duplicate IDs across sections and questions", () => {
    const draft = validDraft();
    draft.sections.push({
      id: "section-1",
      title: "Next",
      questions: [{ ...draft.sections[0]!.questions[0]!, id: "section-1" }],
    });
    let sequence = 100;
    const unique = ensureUniqueTemplateIds(
      draft.sections,
      (prefix = "id") => `${prefix}-${++sequence}`,
    );
    const ids = unique.flatMap((section) => [
      section.id,
      ...section.questions.map((question) => question.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("duplicates sections with fresh IDs and supports ordering", () => {
    let sequence = 100;
    const duplicate = duplicateSection(
      validDraft().sections[0]!,
      (prefix = "id") => `${prefix}-${++sequence}`,
    );
    expect(duplicate.id).not.toBe("section-1");
    expect(duplicate.questions[0]?.id).not.toBe("question-1");
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
});

describe("check-in template validation and payload", () => {
  test("validates required labels, question count, and prep limits", () => {
    const draft = validDraft();
    draft.title = " ";
    draft.sections[0]!.title = "";
    draft.sections[0]!.questions = [];
    draft.leaderPrep = Array.from({ length: 9 }, () => "Prepare");
    const validation = validateCheckInTemplateDraft(draft);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("Template name is required.");
    expect(validation.errors).toContain("Section 1 needs a title.");
    expect(validation.errors).toContain("Add at least one question.");
    expect(validation.errors).toContain("Leader prep is limited to 8 items.");
  });

  test("builds a trimmed payload and appends system leader comments", () => {
    const draft = validDraft();
    draft.title = " Weekly check-in ";
    draft.description = " ";
    draft.leaderPrep = [" Review goals ", ""];
    const payload = buildCheckInTemplatePayload(draft);
    expect(payload.title).toBe("Weekly check-in");
    expect(payload.description).toBeNull();
    expect(payload.leaderPrep).toEqual(["Review goals"]);
    expect(payload.fields.map((field) => field.order)).toEqual([0, 1, 2, 3]);
    expect(payload.fields.at(-1)?.type).toBe("manager_notes");
  });
});
