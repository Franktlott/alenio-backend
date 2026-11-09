import {
  Bell,
  CalendarDays,
  SquareCheckBig,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react-native";
import { router } from "expo-router";
import type { HomeTodayItem, HomeTodayItemType, TaskPriority } from "@/lib/types";

export const TODAY_ITEM_PRESENTATION: Record<
  HomeTodayItemType,
  { label: string; Icon: LucideIcon; color: string; surface: string }
> = {
  task: { label: "Task", Icon: SquareCheckBig, color: "#4361EE", surface: "#EEF2FF" },
  reminder: { label: "Reminder", Icon: Bell, color: "#A65B13", surface: "#FFF5E8" },
  event: { label: "Event", Icon: CalendarDays, color: "#167C63", surface: "#EAF8F3" },
  meeting: { label: "Meeting", Icon: Video, color: "#7550D9", surface: "#F1EDFF" },
  check_in: { label: "Check-in", Icon: Users, color: "#23789B", surface: "#EAF7FB" },
  holiday: { label: "Holiday", Icon: CalendarDays, color: "#A87312", surface: "#FFF7E5" },
  external: { label: "Outlook", Icon: CalendarDays, color: "#2563A9", surface: "#EAF2FC" },
};

/** The verb has to fit the thing: "Review notes" on a task reads as a bug. */
export const TODAY_ITEM_ACTION: Record<HomeTodayItemType, string> = {
  task: "Open task",
  reminder: "Open reminder",
  event: "View event",
  meeting: "View meeting",
  check_in: "Review notes",
  holiday: "View calendar",
  external: "View event",
};

/** Same tokens the task screens use, so a High task looks High everywhere. */
export const PRIORITY_PRESENTATION: Record<
  TaskPriority,
  { label: string; color: string; surface: string }
> = {
  urgent: { label: "Urgent", color: "#C2410C", surface: "#FEECE5" },
  high: { label: "High", color: "#C2410C", surface: "#FFF0E4" },
  medium: { label: "Medium", color: "#2563EB", surface: "#EAF1FE" },
  low: { label: "Low", color: "#64748B", surface: "#F1F4F8" },
};

/** "3 days late" is the fact a reader acts on; the old date is not. */
export function overdueLabel(item: HomeTodayItem): string {
  const due = new Date(item.startAt);
  const today = new Date();
  const daysLate = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()) /
      86_400_000,
  );
  if (daysLate <= 1) return "Due yesterday";
  if (daysLate < 7) return `${daysLate} days late`;
  const weeks = Math.floor(daysLate / 7);
  return weeks === 1 ? "A week late" : `${weeks} weeks late`;
}

/** A task due at 11:59:59 PM was given a day. Any other clock time was chosen. */
export function todayItemHasClock(item: HomeTodayItem): boolean {
  if (item.allDay) return false;
  if (item.type !== "task" && item.type !== "reminder") return true;
  const date = new Date(item.startAt);
  if (Number.isNaN(date.getTime())) return false;
  return !(date.getHours() === 23 && date.getMinutes() === 59 && date.getSeconds() >= 59);
}

export function todayItemTimeLabel(item: HomeTodayItem): string {
  if ((item.type === "task" || item.type === "reminder") && !todayItemHasClock(item)) {
    return "11:59 PM";
  }
  if (item.allDay) return "All day";
  return new Date(item.startAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isTaskLike(item: HomeTodayItem): boolean {
  return item.type === "task" || item.type === "reminder";
}

/** Opens a task or reminder. Events open in the Today card preview. */
export function openTodayItem(item: HomeTodayItem) {
  if (!isTaskLike(item)) return;
  router.push({
    pathname: "/task-detail",
    params: { taskId: item.id, teamId: item.workspace?.id ?? "" },
  });
}

export function editTodayItem(item: HomeTodayItem) {
  router.push({
    pathname: "/task-detail",
    params: {
      taskId: item.id,
      teamId: item.workspace?.id ?? "",
      startEdit: "1",
    },
  });
}
