import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../prisma";
import { audioAccessDecision } from "../check-in-audio-access";
import { canViewCalendarEvent } from "../calendar-permissions";
import { canAccessTask } from "../task-policy";
import {
  canAccessWorkspaceManagerInsights,
  canManageAssignedDevelopmentGoals,
  canManageCheckIns,
  canManageWorkspaceSettings,
  canManageWorkspaceTasks,
} from "../workspace-role-policy";
import { workspaceHasSenecaEntitlement } from "../seneca-scope";
import { getWorkspaceAccess } from "../workspace-access";
import { logAuthz } from "./log";
import {
  loadCheckInAuthzRecord,
  loadConversationAuthzRecord,
  loadEventAuthzRecord,
  loadGoalAuthzRecord,
  loadRecordingAuthzRecord,
  loadTaskAuthzRecord,
  loadWorkspaceMembership,
} from "./loaders";
import {
  AUTHZ_NOT_FOUND_MESSAGE,
  type AuthzAction,
  type AuthzActor,
  type AuthzDecision,
  type AuthzResourceRef,
} from "./types";

function deny(workspaceId: string | null = null): AuthzDecision {
  return {
    allow: false,
    code: "NOT_FOUND",
    message: AUTHZ_NOT_FOUND_MESSAGE,
    workspaceId,
  };
}

function allow(workspaceId: string | null, role: string | null): AuthzDecision {
  return { allow: true, workspaceId, role };
}

export async function authorize(input: {
  actor: AuthzActor;
  action: AuthzAction;
  resource: AuthzResourceRef;
  db?: PrismaClient;
}): Promise<AuthzDecision> {
  const db = input.db ?? prisma;
  const decision = await evaluate(input.actor, input.action, input.resource, db);
  logAuthz({
    actorUserId: input.actor.userId,
    action: input.action,
    resource: input.resource,
    decision,
  });
  return decision;
}

async function evaluate(
  actor: AuthzActor,
  action: AuthzAction,
  resource: AuthzResourceRef,
  db: PrismaClient,
): Promise<AuthzDecision> {
  if (resource.type === "workspace") {
    return authorizeWorkspaceAction(actor, action, resource.id, db);
  }
  if (resource.type === "task") {
    return authorizeTask(actor, action, resource.id, db);
  }
  if (resource.type === "event") {
    return authorizeEvent(actor, action, resource.id, db);
  }
  if (resource.type === "goal") {
    return authorizeGoal(actor, action, resource.id, db);
  }
  if (resource.type === "checkin") {
    return authorizeCheckIn(actor, action, resource.id, db);
  }
  if (resource.type === "recording") {
    return authorizeRecording(actor, action, resource.id, db);
  }
  if (resource.type === "conversation") {
    return authorizeConversation(actor, action, resource.id, db);
  }
  return deny();
}

async function authorizeWorkspaceAction(
  actor: AuthzActor,
  action: AuthzAction,
  workspaceId: string,
  db: PrismaClient,
): Promise<AuthzDecision> {
  const membership = await loadWorkspaceMembership(actor.userId, workspaceId, db);
  if (!membership) return deny(workspaceId);

  if (action === "billing.view") {
    return membership.role === "owner" ? allow(workspaceId, membership.role) : deny(workspaceId);
  }
  if (action === "workspace.admin") {
    return canManageWorkspaceSettings(membership.role)
      ? allow(workspaceId, membership.role)
      : deny(workspaceId);
  }
  if (action === "seneca.use") {
    const access = await getWorkspaceAccess(workspaceId, new Date(), db);
    if (!workspaceHasSenecaEntitlement(access)) return deny(workspaceId);
    return allow(workspaceId, membership.role);
  }
  if (action === "checkin.list_member") {
    return allow(workspaceId, membership.role);
  }
  if (action === "task.view" || action === "event.view" || action === "goal.view") {
    return allow(workspaceId, membership.role);
  }
  return deny(workspaceId);
}

async function authorizeTask(
  actor: AuthzActor,
  action: AuthzAction,
  id: string,
  db: PrismaClient,
): Promise<AuthzDecision> {
  if (action !== "task.view") return deny();
  const task = await loadTaskAuthzRecord(id, db);
  if (!task) return deny();
  const membership = await loadWorkspaceMembership(actor.userId, task.teamId, db);
  if (!membership) return deny(task.teamId);
  if (!canAccessTask(task, actor.userId)) return deny(task.teamId);
  if (task.kind === "workspace_task") {
    const assigned = task.assignments.some((row) => row.userId === actor.userId);
    if (!assigned && !canManageWorkspaceTasks(membership.role) && task.creatorId !== actor.userId) {
      return deny(task.teamId);
    }
  }
  return allow(task.teamId, membership.role);
}

async function authorizeEvent(
  actor: AuthzActor,
  action: AuthzAction,
  id: string,
  db: PrismaClient,
): Promise<AuthzDecision> {
  if (action !== "event.view") return deny();
  const event = await loadEventAuthzRecord(id, db);
  if (!event) return deny();
  const membership = await loadWorkspaceMembership(actor.userId, event.teamId, db);
  if (!membership) return deny(event.teamId);
  const assigneeIds = event.assigneeIds;
  if (!canViewCalendarEvent(event, actor.userId, membership.role, assigneeIds)) {
    return deny(event.teamId);
  }
  return allow(event.teamId, membership.role);
}

async function authorizeGoal(
  actor: AuthzActor,
  action: AuthzAction,
  id: string,
  db: PrismaClient,
): Promise<AuthzDecision> {
  if (action !== "goal.view") return deny();
  const goal = await loadGoalAuthzRecord(id, db);
  if (!goal || goal.archivedAt) return deny();
  const membership = await loadWorkspaceMembership(actor.userId, goal.teamId, db);
  if (!membership) return deny(goal.teamId);
  if (!canManageAssignedDevelopmentGoals(membership.role, actor.userId, goal.memberUserId)) {
    return deny(goal.teamId);
  }
  return allow(goal.teamId, membership.role);
}

async function authorizeCheckIn(
  actor: AuthzActor,
  action: AuthzAction,
  id: string,
  db: PrismaClient,
): Promise<AuthzDecision> {
  const meeting = await loadCheckInAuthzRecord(id, db);
  if (!meeting) return deny();
  const membership = await loadWorkspaceMembership(actor.userId, meeting.teamId, db);
  if (!membership) return deny(meeting.teamId);
  const isManager = canManageCheckIns(membership.role);
  const isSubject = meeting.memberUserId === actor.userId;
  const published = meeting.status === "published";

  if (action === "checkin.list_member") {
    if (isManager || isSubject) return allow(meeting.teamId, membership.role);
    return deny(meeting.teamId);
  }
  if (action === "checkin.view_summary") {
    if (isManager) return allow(meeting.teamId, membership.role);
    if (isSubject && published) return allow(meeting.teamId, membership.role);
    return deny(meeting.teamId);
  }
  if (action === "checkin.view_leader_notes" || action === "checkin.view_transcript") {
    return isManager ? allow(meeting.teamId, membership.role) : deny(meeting.teamId);
  }
  if (action === "checkin.view_audio") {
    return deny(meeting.teamId);
  }
  return deny(meeting.teamId);
}

async function authorizeRecording(
  actor: AuthzActor,
  action: AuthzAction,
  id: string,
  db: PrismaClient,
): Promise<AuthzDecision> {
  const recording = await loadRecordingAuthzRecord(id, db);
  if (!recording) return deny();
  const workspaceId = recording.meeting?.teamId ?? recording.teamId;
  const membership = await loadWorkspaceMembership(actor.userId, workspaceId, db);
  if (!membership) return deny(workspaceId);
  if (action === "checkin.view_transcript") {
    return canManageCheckIns(membership.role)
      ? allow(workspaceId, membership.role)
      : deny(workspaceId);
  }
  if (action === "checkin.view_audio") {
    const audio = audioAccessDecision({
      recording,
      userId: actor.userId,
      now: new Date(),
    });
    return audio.allow ? allow(workspaceId, membership.role) : deny(workspaceId);
  }
  return deny(workspaceId);
}

async function authorizeConversation(
  actor: AuthzActor,
  action: AuthzAction,
  id: string,
  db: PrismaClient,
): Promise<AuthzDecision> {
  if (action !== "chat.view") return deny();
  const conversation = await loadConversationAuthzRecord(id, db);
  if (!conversation) return deny();
  const participant = conversation.participants.some((row) => row.userId === actor.userId);
  if (!participant) return deny(conversation.teamId);
  if (conversation.teamId) {
    const membership = await loadWorkspaceMembership(actor.userId, conversation.teamId, db);
    if (!membership) return deny(conversation.teamId);
    return allow(conversation.teamId, membership.role);
  }
  return allow(null, null);
}

export function canUseManagerWorkspaceData(role: string | null): boolean {
  return canAccessWorkspaceManagerInsights(role);
}

export { AUTHZ_CROSS_ORG_MESSAGE, AUTHZ_NOT_FOUND_MESSAGE } from "./types";
