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

export type OneOnOneTemplateFieldLike = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  helpText?: string | null;
  associateRequest?: AssociateRequestMode | null;
};

export function isAssociateRequestedField(field: OneOnOneTemplateFieldLike): boolean {
  return (
    field.type === "associate_notes" &&
    (field.associateRequest === "task" || field.associateRequest === "message")
  );
}

export function encodeFeedbackTaskDescription(meta: OneOnOneFeedbackMeta): string {
  return `${ONEONE_FEEDBACK_MARKER}\n${JSON.stringify(meta)}\n\nShare your check-in feedback for "${meta.fieldLabel}" or select that you have no feedback to enter.`;
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

export function buildFeedbackPath(meta: Pick<OneOnOneFeedbackMeta, "teamId" | "memberUserId" | "meetingId" | "fieldId">): string {
  const params = new URLSearchParams({
    teamId: meta.teamId,
    memberUserId: meta.memberUserId,
    meetingId: meta.meetingId,
    fieldId: meta.fieldId,
  });
  return `/one-on-one-feedback?${params.toString()}`;
}

export function formatAssociateResponseDisplay(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  if (String(value) === NO_FEEDBACK_VALUE) return "No feedback entered";
  return String(value);
}
