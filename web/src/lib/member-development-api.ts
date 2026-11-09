import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "./api";

/**
 * Check-ins (one-on-ones) and development goals for one member of a
 * workspace. Mirrors the mobile Workspace › Development member view.
 */

const member = (teamId: string, userId: string) =>
  `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`;

/* ---------- check-ins ---------- */

export type CheckInFieldType =
  | "section"
  | "short_text"
  | "long_text"
  | "rating"
  | "yes_no"
  | "manager_notes"
  | "associate_notes";

export type CheckInField = {
  id: string;
  label: string;
  type: CheckInFieldType;
  order: number;
  required?: boolean;
  ratingMax?: number;
  helpText?: string | null;
  associateRequest?: "task" | "message" | null;
};

export type CheckInTemplate = {
  id: string;
  title: string;
  description: string | null;
  libraryKey?: string | null;
  fields: CheckInField[];
};

export type CheckInFollowUpTask = {
  id: string;
  title: string;
  status?: string;
  dueDate?: string | null;
  assignee?: { id: string; name: string | null } | null;
};

export type CheckIn = {
  id: string;
  /** Null for an open check-in, where Seneca chose the questions. */
  templateId: string | null;
  templateTitle: string;
  captureMode?: "manual" | "recorded" | string | null;
  templateFields: CheckInField[];
  responses: Record<string, string | number>;
  status: "draft" | "published";
  publishedAt: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string; image: string | null };
  followUpTasks?: CheckInFollowUpTask[];
  associateFeedbackPending?: boolean;
};

export type PlannedCheckIn = {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  allDay: boolean;
  isVideoMeeting: boolean;
};

export function fetchCheckIns(teamId: string, userId: string) {
  return apiGetJson<{ data: CheckIn[] }>(`${member(teamId, userId)}/one-on-ones`).then((r) => r.data);
}

export function fetchPlannedCheckIns(teamId: string, userId: string) {
  return apiGetJson<{ data: PlannedCheckIn[] }>(`${member(teamId, userId)}/planned-one-on-ones`).then((r) => r.data);
}

export function fetchCheckInTemplates(teamId: string) {
  return apiGetJson<{ data: CheckInTemplate[] }>(
    `/api/teams/${encodeURIComponent(teamId)}/one-on-one-templates`,
  ).then((r) => r.data);
}

export type CheckInLibraryTemplate = {
  key: string;
  title: string;
  description: string | null;
  fields: CheckInField[];
};

export function fetchCheckInTemplateLibrary() {
  return apiGetJson<{ data: CheckInLibraryTemplate[] }>("/api/check-in-template-library").then((r) => r.data);
}

export function addLibraryCheckInTemplate(teamId: string, libraryKey: string) {
  return apiPostJson<{ data: CheckInTemplate }>(
    `/api/teams/${encodeURIComponent(teamId)}/one-on-one-templates/from-library/${encodeURIComponent(libraryKey)}`,
    {},
  ).then((r) => r.data);
}

/** Leader comments are appended by the server. */
export function createCheckInTemplate(
  teamId: string,
  input: { title: string; description?: string | null; fields: CheckInField[] },
) {
  return apiPostJson<{ data: CheckInTemplate }>(
    `/api/teams/${encodeURIComponent(teamId)}/one-on-one-templates`,
    input,
  ).then((r) => r.data);
}

export function createCheckIn(
  teamId: string,
  userId: string,
  input: {
    templateId: string;
    responses: Record<string, string | number>;
    status: "draft" | "published";
    requestAssociateFeedback?: boolean;
  },
) {
  return apiPostJson<{ data: CheckIn }>(`${member(teamId, userId)}/one-on-ones`, input).then((r) => r.data);
}

export function updateCheckIn(
  teamId: string,
  userId: string,
  meetingId: string,
  input: { responses: Record<string, string | number>; status: "draft" | "published"; templateTitle?: string },
) {
  return apiPatchJson<{ data: CheckIn }>(
    `${member(teamId, userId)}/one-on-ones/${encodeURIComponent(meetingId)}`,
    input,
  ).then((r) => r.data);
}

/* ---------- Seneca recordings ---------- */

export type CheckInRecording = {
  id: string;
  status: "recording" | "transcribing" | "ready" | "failed";
  durationSec: number;
  error: string | null;
  meetingId: string | null;
  templateId: string | null;
  createdAt: string;
};

export type ActiveCheckInRecording = CheckInRecording & { templateTitle: string };

export type CheckInAudioStatus = "pending" | "available" | "deleting" | "deleted" | "deletion_failed" | "none";

/** The recording behind a saved check-in, as shown in the transcript panel. */
export type CheckInRecordingDetail = CheckInRecording & {
  transcript: string | null;
  source: "device_mic" | "video_call";
  audioStatus: CheckInAudioStatus;
  audioExpiresAt: string | null;
  audioRetained: boolean;
  audioDeleteReason: "published" | "expired" | "manual" | null;
  canPlayAudio: boolean;
};

export type CheckInAudioPart = { index: number; url: string; durationSec: number };

/** Leaders only. 404s when the check-in was not recorded. */
export function fetchCheckInRecordingForMeeting(teamId: string, userId: string, meetingId: string) {
  return apiGetJson<{ data: CheckInRecordingDetail }>(
    `${member(teamId, userId)}/check-in-recordings/for-meeting/${encodeURIComponent(meetingId)}`,
  ).then((r) => r.data);
}

/** Short-lived links, so fetch them when the leader presses play. */
export function fetchCheckInRecordingAudio(teamId: string, userId: string, recordingId: string) {
  return apiGetJson<{ data: { parts: CheckInAudioPart[]; durationSec: number; expiresAt: string | null } }>(
    `${member(teamId, userId)}/check-in-recordings/${encodeURIComponent(recordingId)}/audio`,
  ).then((r) => r.data);
}

export function deleteCheckInRecordingAudio(teamId: string, userId: string, recordingId: string) {
  return apiDeleteJson<unknown>(
    `${member(teamId, userId)}/check-in-recordings/${encodeURIComponent(recordingId)}/audio`,
  );
}

const recordings = (teamId: string, userId: string) => `${member(teamId, userId)}/check-in-recordings`;

/** Pass a null templateId for an open check-in with no set questions. */
export function startCheckInRecording(teamId: string, userId: string, templateId: string | null) {
  return apiPostJson<{ data: CheckInRecording }>(recordings(teamId, userId), {
    templateId,
    consentAcknowledged: true,
  }).then((r) => r.data);
}

export function uploadCheckInRecordingSegment(
  teamId: string,
  userId: string,
  recordingId: string,
  segment: { index: number; data: string; contentType: string; durationSec: number },
) {
  return apiPostJson<unknown>(
    `${recordings(teamId, userId)}/${encodeURIComponent(recordingId)}/segments`,
    segment,
  );
}

export function finishCheckInRecording(teamId: string, userId: string, recordingId: string, durationSec: number) {
  return apiPostJson<{ data: CheckInRecording }>(
    `${recordings(teamId, userId)}/${encodeURIComponent(recordingId)}/finish`,
    { durationSec },
  ).then((r) => r.data);
}

export function cancelCheckInRecording(teamId: string, userId: string, recordingId: string) {
  return apiPostJson<unknown>(`${recordings(teamId, userId)}/${encodeURIComponent(recordingId)}/cancel`, {});
}

export function fetchCheckInRecording(teamId: string, userId: string, recordingId: string) {
  return apiGetJson<{ data: CheckInRecording }>(
    `${recordings(teamId, userId)}/${encodeURIComponent(recordingId)}`,
  ).then((r) => r.data);
}

/** Recordings still being written up, plus any that failed. */
export function fetchActiveCheckInRecordings(teamId: string, userId: string) {
  return apiGetJson<{ data: ActiveCheckInRecording[] }>(`${recordings(teamId, userId)}/active`).then((r) => r.data);
}

export function deleteCheckIn(teamId: string, userId: string, meetingId: string) {
  return apiDeleteJson<unknown>(`${member(teamId, userId)}/one-on-ones/${encodeURIComponent(meetingId)}`);
}

/** Fields the leader fills in. Associate-requested notes are answered by the member later. */
export function isLeaderFillableField(field: CheckInField): boolean {
  if (field.type === "section") return false;
  if (field.type === "associate_notes" && field.associateRequest) return false;
  return true;
}

/* ---------- goals ---------- */

export type GoalPriority = "low" | "normal" | "high";

export type DevelopmentGoal = {
  id: string;
  skill: string;
  description: string | null;
  dueDate: string | null;
  priority: GoalPriority;
  steps: string[];
  completedStepIndexes: number[];
  completedStepCount?: number;
  totalStepCount?: number;
  progressPercent?: number;
  status: "active" | "inactive" | "closed";
  closedAt: string | null;
  readOnly: boolean;
  nearingInactive?: boolean;
  daysUntilInactive?: number | null;
  createdAt: string;
  createdBy?: { id: string; name: string; image: string | null };
};

export function fetchGoals(teamId: string, userId: string) {
  return apiGetJson<{ data: DevelopmentGoal[] }>(`${member(teamId, userId)}/development-goals`).then((r) => r.data);
}

export function createGoal(
  teamId: string,
  userId: string,
  input: { skill: string; description?: string | null; dueDate?: string | null; priority: GoalPriority; steps: string[] },
) {
  return apiPostJson<{ data: DevelopmentGoal }>(`${member(teamId, userId)}/development-goals`, input).then(
    (r) => r.data,
  );
}

export function setGoalStep(teamId: string, userId: string, goalId: string, stepIndex: number, completed: boolean) {
  return apiPatchJson<{ data: DevelopmentGoal }>(
    `${member(teamId, userId)}/development-goals/${encodeURIComponent(goalId)}/steps/completion`,
    { stepIndex, completed },
  ).then((r) => r.data);
}

export function setGoalStatus(teamId: string, userId: string, goalId: string, status: "active" | "closed") {
  return apiPatchJson<{ data: DevelopmentGoal }>(
    `${member(teamId, userId)}/development-goals/${encodeURIComponent(goalId)}/status`,
    { status },
  ).then((r) => r.data);
}

export function deleteGoal(teamId: string, userId: string, goalId: string) {
  return apiDeleteJson<unknown>(`${member(teamId, userId)}/development-goals/${encodeURIComponent(goalId)}`);
}

/** Completed steps / total, tolerant of older payloads without the progress fields. */
export function goalProgress(goal: DevelopmentGoal): { done: number; total: number; percent: number } {
  const total = goal.totalStepCount ?? goal.steps.length;
  const done = goal.completedStepCount ?? goal.completedStepIndexes?.length ?? 0;
  const percent = goal.progressPercent ?? (total > 0 ? Math.round((done / total) * 100) : 0);
  return { done, total, percent };
}
