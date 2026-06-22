import { randomUUID } from "crypto";

export const LEADER_COMMENTS_SECTION_LABEL = "Leader comments";
export const LEADER_COMMENTS_FIELD_LABEL = "Summary & commitments";
export const LEADER_COMMENTS_HELP_TEXT =
  "Optional. What was agreed, coaching notes, and next steps.";

export type LeaderCommentsField = {
  id: string;
  label: string;
  type: string;
  order: number;
  required?: boolean;
  helpText?: string | null;
  ratingMax?: number;
};

export function templateHasLeaderComments(fields: { type: string }[]): boolean {
  return fields.some((field) => field.type === "manager_notes");
}

export function appendLeaderCommentsFields<T extends LeaderCommentsField>(
  fields: T[],
  newId: () => string = randomUUID,
): T[] {
  if (templateHasLeaderComments(fields)) return fields;
  const maxOrder = fields.reduce((max, field) => Math.max(max, field.order), -1);
  return [
    ...fields,
    {
      id: newId(),
      label: LEADER_COMMENTS_SECTION_LABEL,
      type: "section",
      order: maxOrder + 1,
      required: false,
    } as T,
    {
      id: newId(),
      label: LEADER_COMMENTS_FIELD_LABEL,
      type: "manager_notes",
      order: maxOrder + 2,
      required: false,
      helpText: LEADER_COMMENTS_HELP_TEXT,
    } as T,
  ];
}

type LeaderCommentsFieldLike = { id: string; label: string; type: string };

export function findLeaderCommentsField(fields: LeaderCommentsFieldLike[]): LeaderCommentsFieldLike | null {
  const managerNotes = fields.filter((field) => field.type === "manager_notes");
  if (managerNotes.length === 0) return null;
  const preferred = managerNotes.find(
    (field) =>
      field.label === LEADER_COMMENTS_FIELD_LABEL ||
      /summary|commitment/i.test(field.label),
  );
  return preferred ?? managerNotes[0];
}

export function readLeaderCommentsFromMeeting(
  fields: LeaderCommentsFieldLike[],
  responses: Record<string, string | number>,
): { label: string; text: string } | null {
  const field = findLeaderCommentsField(fields);
  if (!field) return null;
  const raw = responses[field.id];
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  return { label: field.label, text };
}
