import type { OneOnOneTemplateField } from "./api";

export const LEADER_COMMENTS_SECTION_LABEL = "Leader comments";
export const LEADER_COMMENTS_FIELD_LABEL = "Summary & commitments";
export const LEADER_COMMENTS_HELP_TEXT =
  "Optional. What was agreed, coaching notes, and next steps.";

export function templateHasLeaderComments(fields: Pick<OneOnOneTemplateField, "type">[]): boolean {
  return fields.some((field) => field.type === "manager_notes");
}

export function findLeaderCommitmentsFieldId(fields: OneOnOneTemplateField[]): string | null {
  const managerNotes = fields.filter((field) => field.type === "manager_notes");
  if (managerNotes.length === 0) return null;
  const preferred = managerNotes.find(
    (field) =>
      field.label === LEADER_COMMENTS_FIELD_LABEL ||
      /summary|commitment/i.test(field.label),
  );
  return (preferred ?? managerNotes[0]).id;
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

export function findLeaderCommentsField<T extends { id: string; label: string; type: string }>(
  fields: T[],
): T | null {
  const managerNotes = fields.filter((field) => field.type === "manager_notes");
  if (managerNotes.length === 0) return null;
  const preferred = managerNotes.find(
    (field) =>
      field.label === LEADER_COMMENTS_FIELD_LABEL ||
      /summary|commitment/i.test(field.label),
  );
  return preferred ?? managerNotes[0];
}

export function isLeaderCommentsEmpty(
  fields: { id: string; label: string; type: string }[],
  responses: Record<string, string | number | undefined>,
): boolean {
  const field = findLeaderCommentsField(fields);
  if (!field) return false;
  const raw = responses[field.id];
  if (raw === undefined || raw === null) return true;
  return String(raw).trim() === "";
}

export const LEADER_COMMENTS_NUDGE_TITLE = "Add leader notes?";
export const LEADER_COMMENTS_NUDGE_COPY =
  "You haven't added summary and commitments yet. A short note helps your teammate reflect before they respond — but it's optional.";

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
