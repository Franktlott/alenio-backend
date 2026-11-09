import { View, Text, Pressable, StyleSheet } from "react-native";
import { Check, MoreHorizontal, Square } from "lucide-react-native";
import type { Task } from "@/lib/types";
import { isFeedbackTaskDescription } from "@/lib/one-on-one-feedback";
import { isReminderTask } from "@/lib/task-kind";
import { instantHasPassed, scheduleTimeParts } from "@/lib/schedule-time";
import { CheckBurst } from "@/components/schedule/CheckBurst";
import { ScheduleKindIcon } from "@/components/schedule/ScheduleKindIcon";
import { TODAY_ITEM_PRESENTATION } from "@/lib/home-today-item";
import { colors, typography } from "@/theme";
import { AssigneeStack } from "./AssigneeStack";

const TIME_COL = 56;

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
  if (priority === "urgent" || priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Medium";
}

type Props = {
  task: Task;
  isLast?: boolean;
  /** True when this row's task is the one open in the detail pane. */
  selected?: boolean;
  /** Marks which face in the assignee stack is the viewer's own. */
  currentUserId?: string | null;
  onToggle: () => void;
  onPress: () => void;
  onLongPress?: () => void;
};

export function TaskRow({
  task,
  isLast,
  selected,
  currentUserId,
  onToggle,
  onPress,
  onLongPress,
}: Props) {
  const isDone = task.status === "done";
  const isLocked = isDone && isFeedbackTaskDescription(task.description);
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
  const kind = isReminder ? "reminder" : "task";
  const kindPresentation = TODAY_ITEM_PRESENTATION[kind];
  const kindLabel = kindPresentation.label;
  const kindColor = isDone ? colors.textMuted : kindPresentation.color;
  const context = isReminder
    ? "Only you"
    : (task.assignments ?? [])
        .map((assignment) => assignment.user?.name?.trim().split(/\s+/)[0])
        .find((name) => Boolean(name));
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

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: "#E8EAED",
      }}
    >
      <View
        style={{
          width: TIME_COL,
          paddingTop: 10,
          paddingRight: 8,
          flexShrink: 0,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            lineHeight: 15,
            fontWeight: "700",
            color: colors.textPrimary,
          }}
        >
          {time.main}
        </Text>
        {time.sub ? (
          <Text
            style={{
              fontSize: 10,
              lineHeight: 13,
              fontWeight: "600",
              color: colors.textMuted,
            }}
          >
            {time.sub}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          width: StyleSheet.hairlineWidth,
          backgroundColor: "#E8EAED",
          marginVertical: 8,
        }}
      />

      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        testID="task-row"
        style={{
          flex: 1,
          minHeight: 48,
          minWidth: 0,
          paddingVertical: 10,
          paddingLeft: 10,
          paddingRight: 4,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: selected ? "#F5F7FF" : "transparent",
        }}
      >
        <Pressable
          onPress={isLocked ? undefined : onToggle}
          disabled={isLocked}
          hitSlop={6}
          accessibilityLabel={isDone ? "Mark active" : "Mark complete"}
          style={{
            width: 22,
            height: 22,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 8,
            flexShrink: 0,
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
              <Square size={15} color="#8B95A5" strokeWidth={2.1} />
            )}
          </CheckBurst>
        </Pressable>

        <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDone ? "#F2F4F7" : kindPresentation.surface,
              }}
            >
              <ScheduleKindIcon kind={kind} size={12} color={kindColor} />
            </View>
            <Text
              numberOfLines={1}
              style={[
                typography.rowTitle,
                {
                  flexShrink: 1,
                  fontSize: 13,
                  lineHeight: 16,
                  fontWeight: "700",
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
            {/* The same handshake the detail page uses for a joint task, so
                the one shared task is told apart from the identical-looking
                separate copies a multi-person assignment creates. */}
            {task.isJoint ? (
              <Text
                style={{ fontSize: 12, lineHeight: 16, flexShrink: 0 }}
                accessibilityLabel="Joint task"
                testID="task-row-joint-badge"
              >
                🤝
              </Text>
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 1,
              fontSize: 11,
              lineHeight: 14,
              color: colors.textMuted,
              fontWeight: "400",
            }}
          >
            <Text style={{ color: kindColor, fontWeight: "600" }}>{kindLabel}</Text>
            {context ? ` · ${context}` : ""}
            {statusWord ? " · " : ""}
            {statusWord ? (
              <Text
                style={{
                  color: isOverdue ? "#9F2A2A" : colors.textMuted,
                  fontWeight: isOverdue ? "600" : "400",
                }}
              >
                {statusWord}
              </Text>
            ) : null}
          </Text>
        </View>

        {/* A reminder is only ever your own, so its face would say nothing. */}
        {!isReminder ? (
          <View style={{ marginRight: 6 }}>
            <AssigneeStack
              assignments={task.assignments}
              currentUserId={currentUserId}
              faded={isDone}
            />
          </View>
        ) : null}

        {!isReminder ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: "#EEF0F3",
              marginRight: 2,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "600", color: "#64748B" }}>
              {priorityLabel(task.priority)}
            </Text>
          </View>
        ) : null}

        {onLongPress ? (
          <Pressable
            onPress={onLongPress}
            hitSlop={6}
            accessibilityLabel="Task actions"
            style={{
              width: 22,
              height: 22,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MoreHorizontal size={16} color="#94A3B8" strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}
