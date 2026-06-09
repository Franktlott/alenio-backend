export const ONEONE_FEEDBACK_MARKER = "[alenio:oneone-feedback]";
export const NO_FEEDBACK_VALUE = "__no_feedback__";
export const ASSOCIATE_FEEDBACK_FIELD_ID = "__oneone_associate_feedback__";
export const ASSOCIATE_FEEDBACK_LABEL = "Feedback & commitments";

export type AssociateRequestMode = "task" | "message";

export type OneOnOneFeedbackMeta = {
  meetingId: string;
  fieldId: string;
  teamId: string;
  memberUserId: string;
  fieldLabel: string;
};

export function isAssociateRequestedField(field: {
  type: string;
  associateRequest?: AssociateRequestMode | null;
}): boolean {
  return (
    field.type === "associate_notes" &&
    (field.associateRequest === "task" || field.associateRequest === "message")
  );
}

export function parseFeedbackTaskDescription(description: string | null | undefined): OneOnOneFeedbackMeta | null {
  if (!description?.includes(ONEONE_FEEDBACK_MARKER)) return null;
  try {
    const jsonLine = description.split("\n").find((line) => line.trim().startsWith("{"));
    if (!jsonLine) return null;
    const parsed = JSON.parse(jsonLine) as OneOnOneFeedbackMeta;
    if (!parsed.meetingId || !parsed.fieldId || !parsed.teamId || !parsed.memberUserId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isFeedbackTaskDescription(description: string | null | undefined): boolean {
  return parseFeedbackTaskDescription(description) !== null;
}

export function formatTaskDescriptionForDisplay(description: string | null | undefined): string {
  if (!description?.trim()) return "";
  const meta = parseFeedbackTaskDescription(description);
  if (!meta) return description.trim();
  const human = description
    .split("\n")
    .filter((line) => !line.includes(ONEONE_FEEDBACK_MARKER) && !line.trim().startsWith("{"))
    .join("\n")
    .trim();
  if (human) return human;
  return `Share your 1:1 feedback for "${meta.fieldLabel}" or select that you have no feedback to enter.`;
}

export function formatAssociateResponseDisplay(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  if (String(value) === NO_FEEDBACK_VALUE) return "No feedback entered";
  return String(value);
}

export function associateRequestLabel(mode: AssociateRequestMode | null | undefined): string {
  if (mode === "task") return "Send as task";
  if (mode === "message") return "Send as message";
  return "Manager fills in";
}
