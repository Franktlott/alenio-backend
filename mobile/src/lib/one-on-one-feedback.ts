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

export type OneOnOneFeedbackMeta = {
  meetingId: string;
  fieldId: string;
  teamId: string;
  memberUserId: string;
  fieldLabel: string;
};

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
