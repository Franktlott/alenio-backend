export const ONEONE_FEEDBACK_MARKER = "[alenio:oneone-feedback]";
export const NO_FEEDBACK_VALUE = "__no_feedback__";
export const ASSOCIATE_FEEDBACK_FIELD_ID = "__oneone_associate_feedback__";
export const ASSOCIATE_FEEDBACK_LABEL = "Associate feedback and commitments";
export const ASSOCIATE_FEEDBACK_INTRO =
  "This is your time to capture key takeaways, commitments, and next steps from your conversation.";
export const ASSOCIATE_FEEDBACK_PLACEHOLDER = "Key takeaways, commitments, and next steps…";
export const ASSOCIATE_FEEDBACK_SECTION_TITLE = "Your notes";
export const ASSOCIATE_FEEDBACK_MODE_LABEL = "Share notes";
export const ASSOCIATE_FEEDBACK_NONE_LABEL = "Nothing to add";
export const ASSOCIATE_FEEDBACK_SUBMIT_LABEL = "Save notes";
export const ASSOCIATE_FEEDBACK_COMPLETE_MESSAGE = "Thank you for completing this check-in.";
export const ASSOCIATE_FEEDBACK_COMPLETE_DELAY_MS = 4000;
export const LEADER_COMMENTS_PREVIEW_TITLE = "Leader comments";

export function formatLeaderCommentsFrom(leaderName: string | null | undefined): string {
  const who = leaderName?.trim();
  return who ? `From ${who}` : "From your leader";
}

export function associateFeedbackTaskTitle(templateTitle: string): string {
  return `Follow up on ${templateTitle}`;
}

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

/** True when the signed-in user is the associate who should complete check-in follow-up notes. */
export function isAssociateFeedbackRecipient(
  userId: string | undefined,
  meta: OneOnOneFeedbackMeta | null | undefined,
): boolean {
  return !!userId && !!meta && userId === meta.memberUserId;
}

type FeedbackTaskLink = {
  description?: string | null;
  oneOnOneMeetingId?: string | null;
  oneOnOneMeeting?: {
    id: string;
    memberUserId: string;
  } | null;
  teamId?: string | null;
};

/** Prefer live task ↔ check-in link over embedded description metadata. */
export function resolveFeedbackTaskMeta(
  task: FeedbackTaskLink,
  teamIdFallback?: string | null,
): OneOnOneFeedbackMeta | null {
  const parsed = parseFeedbackTaskDescription(task.description);
  const meetingId = task.oneOnOneMeetingId ?? task.oneOnOneMeeting?.id ?? parsed?.meetingId ?? null;
  const memberUserId = task.oneOnOneMeeting?.memberUserId ?? parsed?.memberUserId ?? null;
  const teamId = task.teamId ?? teamIdFallback ?? parsed?.teamId ?? null;
  if (!meetingId || !memberUserId || !teamId) return parsed;

  return {
    meetingId,
    memberUserId,
    teamId,
    fieldId: parsed?.fieldId ?? ASSOCIATE_FEEDBACK_FIELD_ID,
    fieldLabel: parsed?.fieldLabel ?? ASSOCIATE_FEEDBACK_LABEL,
  };
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
  return ASSOCIATE_FEEDBACK_INTRO;
}

export function formatAssociateResponseDisplay(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  if (String(value) === NO_FEEDBACK_VALUE) return "Nothing to add";
  return String(value);
}

export function formatYesNoResponseDisplay(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  const answer = String(value).toLowerCase();
  if (answer === "yes") return "Yes";
  if (answer === "no") return "No";
  return String(value);
}

export function associateRequestLabel(mode: AssociateRequestMode | null | undefined): string {
  if (mode === "task") return "Send as task";
  if (mode === "message") return "Send as message";
  return "Manager fills in";
}
