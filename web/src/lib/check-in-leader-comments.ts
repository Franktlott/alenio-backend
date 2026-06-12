import type { OneOnOneTemplateField } from "./api";

export const LEADER_COMMENTS_SECTION_LABEL = "Leader comments";
export const LEADER_COMMENTS_FIELD_LABEL = "Summary & commitments";
export const LEADER_COMMENTS_HELP_TEXT =
  "Optional. What was agreed, coaching notes, and next steps.";

export function templateHasLeaderComments(fields: Pick<OneOnOneTemplateField, "type">[]): boolean {
  return fields.some((field) => field.type === "manager_notes");
}

export function appendLeaderCommentsIfMissing(fields: OneOnOneTemplateField[]): OneOnOneTemplateField[] {
  if (templateHasLeaderComments(fields)) return fields;
  const maxOrder = fields.reduce((max, field) => Math.max(max, field.order), -1);
  return [
    ...fields,
    {
      id: crypto.randomUUID(),
      label: LEADER_COMMENTS_SECTION_LABEL,
      type: "section",
      order: maxOrder + 1,
      required: false,
    },
    {
      id: crypto.randomUUID(),
      label: LEADER_COMMENTS_FIELD_LABEL,
      type: "manager_notes",
      order: maxOrder + 2,
      required: false,
      helpText: LEADER_COMMENTS_HELP_TEXT,
    },
  ];
}

function reorderFields(fields: OneOnOneTemplateField[]): OneOnOneTemplateField[] {
  return fields.map((field, index) => ({ ...field, order: index }));
}

/** Remove auto-added leader comments from editable template field lists. */
export function stripLeaderCommentsFields(fields: OneOnOneTemplateField[]): OneOnOneTemplateField[] {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const skipSectionIds = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const field = sorted[i];
    if (field.type !== "section") continue;

    const sectionFields: OneOnOneTemplateField[] = [];
    let j = i + 1;
    while (j < sorted.length && sorted[j].type !== "section") {
      sectionFields.push(sorted[j]);
      j++;
    }

    const isLeaderSection =
      field.label === LEADER_COMMENTS_SECTION_LABEL ||
      (sectionFields.length > 0 && sectionFields.every((f) => f.type === "manager_notes"));

    if (isLeaderSection) skipSectionIds.add(field.id);
  }

  return reorderFields(
    sorted.filter((field) => field.type !== "manager_notes" && !skipSectionIds.has(field.id)),
  );
}
