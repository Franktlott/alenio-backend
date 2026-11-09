import React from "react";
import { ActivityIndicator, View, Text, Pressable } from "react-native";
import { AlertCircle, Calendar, CheckCircle2, ChevronRight, ClipboardList } from "lucide-react-native";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import type { Task } from "@/lib/types";
import { workspaceTasksOnly } from "@/lib/task-kind";

export type TeamOverviewTaskFilter =
  | "open"
  | "actionTasks"
  | "dueToday"
  | "overdue"
  | "completedToday";

type Props = {
  visible: boolean;
  filter: TeamOverviewTaskFilter;
  tasks: Task[];
  onClose: () => void;
  onTaskPress: (task: Task) => void;
  loading?: boolean;
};

type FilterConfig = {
  title: string;
  subtitle: (count: number) => string;
  empty: string;
  iconBg: string;
  iconColor: string;
  Icon: typeof AlertCircle;
};

const FILTER_CONFIG: Record<TeamOverviewTaskFilter, FilterConfig> = {
  open: {
    title: "Open tasks",
    subtitle: (count) => `${count} incomplete ${count === 1 ? "task" : "tasks"}`,
    empty: "No open tasks",
    iconBg: "#D1FAE5",
    iconColor: "#10B981",
    Icon: ClipboardList,
  },
  actionTasks: {
    title: "Needs action",
    subtitle: (count) =>
      `${count} ${count === 1 ? "task is" : "tasks are"} overdue or due today`,
    empty: "Nothing overdue or due today",
    iconBg: "#FFEDD5",
    iconColor: "#EA580C",
    Icon: AlertCircle,
  },
  dueToday: {
    title: "Due today",
    subtitle: (count) => `${count} ${count === 1 ? "task is" : "tasks are"} due today`,
    empty: "Nothing due today",
    iconBg: "#FEF3C7",
    iconColor: "#F59E0B",
    Icon: Calendar,
  },
  overdue: {
    title: "Overdue tasks",
    subtitle: (count) => `${count} ${count === 1 ? "task needs" : "tasks need"} attention`,
    empty: "No overdue tasks",
    iconBg: "#FEE2E2",
    iconColor: "#EF4444",
    Icon: AlertCircle,
  },
  completedToday: {
    title: "Completed today",
    subtitle: (count) => `${count} ${count === 1 ? "task was" : "tasks were"} completed today`,
    empty: "Nothing completed today",
    iconBg: "#DCFCE7",
    iconColor: "#16A34A",
    Icon: CheckCircle2,
  },
};

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function assigneeLabel(task: Task): string {
  const names = task.assignments?.map((a) => a.user?.name).filter(Boolean) as string[] | undefined;
  if (!names?.length) return "Unassigned";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}

function isOverdue(task: Task, now = new Date()): boolean {
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate).getTime();
  return Number.isFinite(due) && due < now.getTime();
}

/**
 * Overdue and due-today tasks share the Action list, so each row carries its
 * own colour and icon rather than being split under headings. Every other
 * list is one kind of task, so those rows keep the sheet's own styling.
 */
function rowStyling(
  task: Task,
  filter: TeamOverviewTaskFilter,
  config: FilterConfig,
): Pick<FilterConfig, "iconBg" | "iconColor" | "Icon"> {
  if (filter !== "actionTasks") return config;
  return isOverdue(task)
    ? { iconBg: "#FEE2E2", iconColor: "#EF4444", Icon: AlertCircle }
    : { iconBg: "#FEF3C7", iconColor: "#F59E0B", Icon: Calendar };
}

function taskMeta(task: Task, filter: TeamOverviewTaskFilter): string {
  const assignee = assigneeLabel(task);
  const priority = `${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)} priority`;
  if (filter === "actionTasks" && task.dueDate) {
    // Says which of the two kinds this is in words, not colour alone.
    const when = isOverdue(task)
      ? `Overdue ${formatDueDate(task.dueDate)}`
      : "Due today";
    return `${assignee} · ${when} · ${priority}`;
  }
  if (filter === "completedToday" && task.completedAt) {
    return `${assignee} · ${priority} · Completed ${new Date(task.completedAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  if (filter === "open" && !task.dueDate) return `${assignee} · ${priority}`;
  if (task.dueDate) return `${assignee} · Due ${formatDueDate(task.dueDate)} · ${priority}`;
  return `${assignee} · ${priority}`;
}

export function TeamOverviewTasksSheet({ visible, filter, tasks, onClose, onTaskPress, loading = false }: Props) {
  const config = FILTER_CONFIG[filter];
  const workspaceTasks = workspaceTasksOnly(tasks);

  return (
    <AlenioBottomSheet
      visible={visible}
      title={config.title}
      subtitle={loading ? "Loading tasks…" : config.subtitle(workspaceTasks.length)}
      onClose={onClose}
      compact
      showCloseButton
      showScrollIndicator={workspaceTasks.length > 5}
      testID={`snapshot-${filter}-tasks-sheet`}
    >
      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }} testID="snapshot-tasks-loading">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : workspaceTasks.length === 0 ? (
        <View style={{ paddingVertical: 20, alignItems: "center" }} testID="snapshot-tasks-empty">
          <Text style={{ fontSize: 12, color: "#667085" }}>{config.empty}</Text>
        </View>
      ) : (
        <View testID="snapshot-tasks-list">
          {workspaceTasks.map((task) => {
            const row = rowStyling(task, filter, config);
            const RowIcon = row.Icon;
            return (
            <Pressable
              key={task.id}
              onPress={() => onTaskPress(task)}
              accessibilityRole="button"
              accessibilityLabel={`${task.title}, ${taskMeta(task, filter)}`}
              testID={`snapshot-task-${task.id}`}
              style={{
                position: "relative",
                flexDirection: "row",
                alignItems: "center",
                minHeight: 43,
                marginBottom: 4,
                paddingVertical: 5,
                paddingLeft: 10,
                paddingRight: 8,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "#E4EAF1",
                borderRadius: 12,
                backgroundColor: "#F1F5F9",
                gap: 7,
              }}
            >
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: 3,
                  backgroundColor: row.iconColor,
                }}
              />
              <View
                style={{
                  width: 25,
                  height: 25,
                  borderRadius: 8,
                  backgroundColor: row.iconBg,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <RowIcon size={13} color={row.iconColor} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: "700", color: "#111827", lineHeight: 15 }}>
                  {task.title}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 9, color: "#667085", lineHeight: 12 }}>
                  {taskMeta(task, filter)}
                </Text>
              </View>
              <ChevronRight size={14} color="#CBD5E1" />
            </Pressable>
            );
          })}
        </View>
      )}
    </AlenioBottomSheet>
  );
}
