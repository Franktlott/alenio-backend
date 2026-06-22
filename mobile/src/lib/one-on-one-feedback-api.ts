import { api } from "@/lib/api/api";

export type OneOnOneAssociateFeedbackContext = {
  fieldId: string;
  fieldLabel: string;
  helpText: string | null;
  meetingTitle: string;
  currentResponse: string;
  submitted: boolean;
  associateRequest: "task" | "message" | null;
  leaderComments: string | null;
  leaderCommentsLabel: string | null;
};

export function fetchOneOnOneAssociateFeedbackContext(
  teamId: string,
  memberUserId: string,
  meetingId: string,
  fieldId: string,
) {
  const team = encodeURIComponent(teamId);
  const member = encodeURIComponent(memberUserId);
  const meeting = encodeURIComponent(meetingId);
  const field = encodeURIComponent(fieldId);
  return api.get<OneOnOneAssociateFeedbackContext>(
    `/api/teams/${team}/members/${member}/one-on-ones/${meeting}/associate-feedback/${field}`,
  );
}

export function submitOneOnOneAssociateFeedback(
  teamId: string,
  memberUserId: string,
  meetingId: string,
  input: { fieldId: string; response: string },
) {
  const team = encodeURIComponent(teamId);
  const member = encodeURIComponent(memberUserId);
  const meeting = encodeURIComponent(meetingId);
  return api.post<unknown>(
    `/api/teams/${team}/members/${member}/one-on-ones/${meeting}/associate-feedback`,
    input,
  );
}
