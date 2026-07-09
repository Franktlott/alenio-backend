import { router } from "expo-router";
import { planOneOnOneHref } from "./plan-one-on-one";
import type { SenecaActionId } from "./seneca-assistant";
import type { SenecaAskActionId } from "./seneca-api";
import type { SenecaQuickAction } from "./seneca-briefing";

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
      if (memberUserId) {
        router.push(
          planOneOnOneHref(teamId, {
            memberUserId,
          }),
        );
      } else {
        router.push(planOneOnOneHref(teamId));
      }
      break;
    case "create_recognition":
      router.push("/(app)/activity");
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
      if (memberUserId) {
        router.push(
          planOneOnOneHref(teamId, {
            memberUserId,
          }),
        );
      } else {
        router.push(planOneOnOneHref(teamId));
      }
      break;
    case "create_dev_note":
      if (memberUserId) {
        router.push({
          pathname: "/member-profile",
          params: { teamId, memberUserId, tab: "growth" },
        });
      } else {
        router.push("/(app)/team");
      }
      break;
    case "view_tasks":
      router.push("/(app)/execute");
      break;
    case "send_reminder":
    case "create_shoutout":
    case "add_recognition_note":
      router.push("/(app)/activity");
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
      router.push(planOneOnOneHref(teamId));
      break;
    case "recognize":
      router.push("/(app)/activity");
      break;
  }
}
