import type { OneOnOneTemplateField } from "./member-profile-api";

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
