import { router } from "expo-router";
import { scheduleCheckInHref } from "./meeting-navigation";
import type { SenecaActionId } from "./seneca-assistant";
import type { SenecaAskActionId } from "./seneca-api";
import type { SenecaQuickAction } from "./seneca-briefing";
import {
  isSenecaFocusActionId,
} from "./seneca-focus";
import { senecaFocusDestination } from "./seneca-focus-presentation";
import { workspaceDevelopmentHref } from "./workspace-development-navigation";

export function senecaFocusActionNavigate(
  actionId: string,
  teamId: string,
  affectedMemberIds: string[] = [],
): boolean {
  if (!isSenecaFocusActionId(actionId)) return false;
  router.push(senecaFocusDestination(actionId, teamId, affectedMemberIds));
  return true;
}

export function senecaActionNavigate(
  actionId: SenecaActionId | SenecaAskActionId,
  teamId: string,
  taskId?: string,
  memberUserId?: string,
) {
  switch (actionId) {
    case "create_follow_up_task":
      router.push({ pathname: "/create-task", params: { teamId } });
      break;
    case "schedule_check_in":
      router.push(scheduleCheckInHref(teamId));
      break;
    case "create_recognition":
      router.push({ pathname: "/recognition-hub", params: { openGive: "1" } });
      break;
    case "build_checklist":
      router.push("/(app)/execute");
      break;
    case "view_overdue_tasks":
      router.push("/(app)/execute");
      break;
    case "open_task":
      if (taskId) {
        router.push({ pathname: "/task-detail", params: { taskId, teamId } });
      } else {
        router.push("/(app)/execute");
      }
      break;
    case "open_team":
      router.push("/(app)/team");
      break;
  }
}

export function briefingActionNavigate(
  actionId: string,
  teamId: string,
  memberUserId?: string,
) {
  switch (actionId) {
    case "review_checklist":
      router.push("/(app)/execute");
      break;
    case "coach_owner":
    case "prepare_1on1":
      router.push(scheduleCheckInHref(teamId));
      break;
    case "create_dev_note":
      if (memberUserId) {
        router.push(
          workspaceDevelopmentHref(teamId, {
            memberUserId,
            section: "goals",
          }),
        );
      } else {
        router.push(workspaceDevelopmentHref(teamId));
      }
      break;
    case "view_tasks":
      router.push("/(app)/execute");
      break;
    case "send_reminder":
    case "create_shoutout":
    case "add_recognition_note":
      router.push({ pathname: "/recognition-hub", params: { openGive: "1" } });
      break;
    default:
      router.push("/(app)/execute");
  }
}

export function quickActionNavigate(actionId: SenecaQuickAction["id"], teamId: string) {
  switch (actionId) {
    case "checklist":
      router.push("/(app)/execute");
      break;
    case "task":
      router.push({ pathname: "/create-task", params: { teamId } });
      break;
    case "check_in":
      router.push(scheduleCheckInHref(teamId));
      break;
    case "recognize":
      router.push({ pathname: "/recognition-hub", params: { openGive: "1" } });
      break;
  }
}
