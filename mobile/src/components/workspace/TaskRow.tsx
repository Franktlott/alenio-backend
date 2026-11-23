import { View, Text, Pressable } from "react-native";
import { Check, Square } from "lucide-react-native";
import type { Task } from "@/lib/types";
import { isReminderTask } from "@/lib/task-kind";
import { instantHasPassed, scheduleTimeParts } from "@/lib/schedule-time";
import { CheckBurst } from "@/components/schedule/CheckBurst";
import { TimelineRow } from "@/components/schedule/TimelineRow";
import { colors } from "@/theme";
import { PriorityBadge } from "@/components/ui";
import { AssigneeStack } from "./AssigneeStack";

function startOfDay(value: Date): Date {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole days from today to the due date: 0 today, 1 tomorrow, negative past. */
function dayDelta(due: Date, now: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round(
    (startOfDay(due).getTime() - startOfDay(now).getTime()) / dayMs,
  );
}

function formatDay(value: Date): string {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function priorityLabel(priority?: string | null): string {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Medium";
}

/** Medium is the default — only show a chip when priority is notable. */
function shouldShowPriority(priority?: string | null): boolean {
  return priority === "urgent" || priority === "high" || priority === "low";
}

type Props = {
  task: Task;
  isFirst?: boolean;
  isLast?: boolean;
  /** True when this row's task is the one open in the detail pane. */
  selected?: boolean;
  /** Marks which face in the assignee stack is the viewer's own. */
  currentUserId?: string | null;
  /** Kept for callers; avatars stay trailing so the row stays one compact block. */
  compact?: boolean;
  onToggle: () => void;
  onPress: () => void;
  onLongPress?: () => void;
  onAssigneesPress?: () => void;
};

export function TaskRow({
  task,
  isFirst,
  isLast,
  selected,
  currentUserId,
  onToggle,
  onPress,
  onLongPress,
  onAssigneesPress,
}: Props) {
  const isDone = task.status === "done";
  const isReminder = isReminderTask(task);
  const now = new Date();
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const daysOut = due ? dayDelta(due, now) : null;
  const isOverdue = !isDone && instantHasPassed(due, now);
  const time = scheduleTimeParts({
    at: due,
    taskLike: true,
    done: isDone,
    now,
  });
  const assignments = task.assignments ?? [];
  const statusWord = isDone
    ? "Completed"
    : isOverdue
      ? "Overdue"
      : !due
        ? "No due date"
        : daysOut === 0
          ? null
          : daysOut === 1
            ? "Tomorrow"
            : due
              ? formatDay(due)
              : null;
  const showAvatars = !isReminder && assignments.length >= 1;
  const showPriority = !isReminder && shouldShowPriority(task.priority);
  const showMeta =
    task.isJoint || !!statusWord || showPriority || isReminder;

  const checkbox = (
    <Pressable
      onPress={(event) => {
        event.stopPropagation?.();
        onToggle();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityState={{ checked: isDone }}
      accessibilityLabel="Open task"
      style={{
        width: 26,
        height: 26,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CheckBurst checked={isDone}>
        {isDone ? (
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              backgroundColor: "#16A34A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check size={11} color="#FFFFFF" strokeWidth={3} />
          </View>
        ) : (
          <Square size={16} color="#8B95A5" strokeWidth={2.1} />
        )}
      </CheckBurst>
    </Pressable>
  );

  return (
    <TimelineRow
      timeMain={time.main}
      timeSub={time.sub}
      leading={checkbox}
      selected={selected}
      isFirst={isFirst}
      isLast={isLast}
      // Tasks tab is a list, not a day timeline — keep the rail for schedule views.
      showRail={false}
      dense
      onPress={onPress}
      onLongPress={onLongPress}
      testID="task-row"
      trailing={
        showAvatars ? (
          <AssigneeStack
            assignments={assignments}
            currentUserId={currentUserId}
            faded={isDone}
            onPress={onAssigneesPress}
          />
        ) : null
      }
    >
      <Text
        numberOfLines={2}
        style={[
          {
            fontSize: 13.5,
            lineHeight: 17,
            fontWeight: "700",
            color: colors.textPrimary,
          },
          isDone
            ? {
                color: colors.textMuted,
                textDecorationLine: "line-through",
              }
            : null,
        ]}
      >
        {task.title}
      </Text>

      {showMeta ? (
        <View
          style={{
            marginTop: 1,
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 6,
            minWidth: 0,
          }}
        >
          {task.isJoint ? (
            <Text
              style={{
                fontSize: 11,
                lineHeight: 13,
                fontWeight: "600",
                color: "#64748B",
              }}
              accessibilityLabel="Joint task"
              testID="task-row-joint-badge"
            >
              🤝 Joint task
            </Text>
          ) : null}
          {task.isJoint && (statusWord || showPriority || isReminder) ? (
            <Text style={{ fontSize: 11, lineHeight: 13, color: "#C4C9D4" }}>
              ·
            </Text>
          ) : null}
          {statusWord ? (
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontSize: 11,
                lineHeight: 13,
                fontWeight: isOverdue ? "600" : "500",
                color: isOverdue ? "#9F2A2A" : colors.textMuted,
              }}
            >
              {statusWord}
            </Text>
          ) : isReminder ? (
            <Text
              style={{
                fontSize: 11,
                lineHeight: 13,
                fontWeight: "500",
                color: colors.textMuted,
              }}
            >
              Only you
            </Text>
          ) : null}
          {showPriority && task.priority ? (
            <PriorityBadge
              priority={task.priority}
              label={priorityLabel(task.priority)}
              faded={isDone}
            />
          ) : null}
        </View>
      ) : null}
    </TimelineRow>
  );
}
