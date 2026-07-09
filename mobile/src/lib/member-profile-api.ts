import { api } from "@/lib/api/api";
import type { PlannedOneOnOneEvent } from "@/lib/plan-one-on-one";

export type DevelopmentGoalNote = {
  id: string;
  body: string;
  createdAt: string;
  createdById: string;
  createdBy: { id: string; name: string; email: string; image: string | null };
};

export type DevelopmentGoalStatus = "active" | "inactive" | "closed";

export type DevelopmentGoal = {
  id: string;
  teamId: string;
  memberUserId: string;
  skill: string;
  steps: string[];
  status: DevelopmentGoalStatus;
  closedAt: string | null;
  lastActivityAt?: string;
  daysSinceActivity?: number;
  daysUntilInactive?: number | null;
  nearingInactive?: boolean;
  inactivityPolicyDays?: number;
  createdById: string;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string; image: string | null };
  notes: DevelopmentGoalNote[];
};

export type OneOnOneTemplateFieldType =
  | "section"
  | "short_text"
  | "long_text"
  | "rating"
  | "yes_no"
  | "manager_notes"
  | "associate_notes";

export type OneOnOneTemplateField = {
  id: string;
  label: string;
  type: OneOnOneTemplateFieldType;
  order: number;
  required?: boolean;
  ratingMax?: number;
  helpText?: string | null;
  associateRequest?: "task" | "message" | null;
};

export type OneOnOneTemplate = {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  fields: OneOnOneTemplateField[];
  leaderPrep?: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string; email: string; image: string | null };
};

export type OneOnOneFollowUpTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  assignee: { id: string; name: string | null; email: string; image: string | null } | null;
};

export type OneOnOneFollowUpTaskInput = {
  title: string;
  assigneeUserId: string;
  description?: string;
  dueDate?: string;
};

export type OneOnOneMeeting = {
  id: string;
  teamId: string;
  memberUserId: string;
  templateId: string | null;
  templateTitle: string;
  templateFields: OneOnOneTemplateField[];
  responses: Record<string, string | number>;
  status?: "draft" | "published";
  publishedAt?: string | null;
  createdById: string;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string; image: string | null };
  followUpTasks?: OneOnOneFollowUpTask[];
  associateFeedbackPending?: boolean;
};

function enc(teamId: string, memberUserId?: string, extra?: string) {
  const team = encodeURIComponent(teamId);
  if (!memberUserId) return `/api/teams/${team}`;
  const member = encodeURIComponent(memberUserId);
  const base = `/api/teams/${team}/members/${member}`;
  return extra ? `${base}${extra}` : base;
}

export function fetchDevelopmentGoals(teamId: string, memberUserId: string) {
  return api.get<DevelopmentGoal[]>(`${enc(teamId, memberUserId)}/development-goals`);
}

export function createDevelopmentGoal(
  teamId: string,
  memberUserId: string,
  input: { skill: string; steps: string[] },
) {
  return api.post<DevelopmentGoal>(`${enc(teamId, memberUserId)}/development-goals`, input);
}

export function updateDevelopmentGoal(
  teamId: string,
  memberUserId: string,
  goalId: string,
  input: { skill: string; steps: string[] },
) {
  return api.patch<DevelopmentGoal>(
    `${enc(teamId, memberUserId)}/development-goals/${encodeURIComponent(goalId)}`,
    input,
  );
}

export function addDevelopmentGoalNote(
  teamId: string,
  memberUserId: string,
  goalId: string,
  body: string,
) {
  return api.post<DevelopmentGoal>(
    `${enc(teamId, memberUserId)}/development-goals/${encodeURIComponent(goalId)}/notes`,
    { body },
  );
}

export function updateDevelopmentGoalNote(
  teamId: string,
  memberUserId: string,
  goalId: string,
  noteId: string,
  body: string,
) {
  return api.patch<DevelopmentGoal>(
    `${enc(teamId, memberUserId)}/development-goals/${encodeURIComponent(goalId)}/notes/${encodeURIComponent(noteId)}`,
    { body },
  );
}

export function deleteDevelopmentGoalNote(
  teamId: string,
  memberUserId: string,
  goalId: string,
  noteId: string,
) {
  return api.delete<DevelopmentGoal>(
    `${enc(teamId, memberUserId)}/development-goals/${encodeURIComponent(goalId)}/notes/${encodeURIComponent(noteId)}`,
  );
}

export function setDevelopmentGoalStatus(
  teamId: string,
  memberUserId: string,
  goalId: string,
  status: DevelopmentGoalStatus,
) {
  return api.patch<DevelopmentGoal>(
    `${enc(teamId, memberUserId)}/development-goals/${encodeURIComponent(goalId)}/status`,
    { status },
  );
}

export function deleteDevelopmentGoal(teamId: string, memberUserId: string, goalId: string) {
  return api.delete<{ deleted: boolean }>(
    `${enc(teamId, memberUserId)}/development-goals/${encodeURIComponent(goalId)}`,
  );
}

export function fetchOneOnOneMeetings(teamId: string, memberUserId: string) {
  return api.get<OneOnOneMeeting[]>(`${enc(teamId, memberUserId)}/one-on-ones`);
}

export function fetchPlannedOneOnOnes(teamId: string, memberUserId: string) {
  return api.get<PlannedOneOnOneEvent[]>(`${enc(teamId, memberUserId)}/planned-one-on-ones`);
}

export function createOneOnOneMeeting(
  teamId: string,
  memberUserId: string,
  input: {
    templateId: string;
    responses: Record<string, string | number>;
    followUpTasks?: OneOnOneFollowUpTaskInput[];
    requestAssociateFeedback?: boolean;
    status?: "draft" | "published";
  },
) {
  return api.post<OneOnOneMeeting>(`${enc(teamId, memberUserId)}/one-on-ones`, input);
}

export function updateOneOnOneMeeting(
  teamId: string,
  memberUserId: string,
  meetingId: string,
  input: {
    responses: Record<string, string | number>;
    followUpTasks?: OneOnOneFollowUpTaskInput[];
    requestAssociateFeedback?: boolean;
    status?: "draft" | "published";
  },
) {
  return api.patch<OneOnOneMeeting>(
    `${enc(teamId, memberUserId)}/one-on-ones/${encodeURIComponent(meetingId)}`,
    input,
  );
}

export function deleteOneOnOneMeeting(teamId: string, memberUserId: string, meetingId: string) {
  return api.delete<{ deleted: boolean }>(
    `${enc(teamId, memberUserId)}/one-on-ones/${encodeURIComponent(meetingId)}`,
  );
}

export function fetchOneOnOneTemplates(teamId: string) {
  return api.get<OneOnOneTemplate[]>(`${enc(teamId)}/one-on-one-templates`);
}
