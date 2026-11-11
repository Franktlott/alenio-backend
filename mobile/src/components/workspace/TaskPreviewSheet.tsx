import { Pressable, Text, View } from "react-native";
import { CalendarDays, Check, Clock3, FileText, Pencil, UserRound } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { isFeedbackTaskDescription } from "@/lib/one-on-one-feedback";
import { isTaskOverdue } from "@/lib/seneca-task-display";
import { isReminderTask } from "@/lib/task-kind";
import { formatTaskDueClock, taskDueHasClock } from "@/lib/timezone";
import type { Task } from "@/lib/types";
import { colors } from "@/theme";

type Props = {
  visible: boolean;
  task: Task | null;
  onClose: () => void;
  onEdit?: () => void;
  onComplete?: () => void;
};

function formatTaskDate(dueDate: string | null | undefined): string {
  if (!dueDate) return "No due date";
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTaskTime(task: Task): string {
  if (!task.dueDate) return "No time";
  if (isReminderTask(task) && !taskDueHasClock(task.dueDate)) return "Anytime";
  return formatTaskDueClock(task.dueDate) ?? "End of day";
}

function DetailRow({
  icon: Icon,
  label,
  value,
  valueColor,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.brandSoft,
        }}
      >
        <Icon size={15} color={colors.brand} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted }}>
          {label.toUpperCase()}
        </Text>
        <Text
          style={{
            marginTop: 1,
            fontSize: 13,
            lineHeight: 17,
            fontWeight: "600",
            color: valueColor ?? colors.textPrimary,
          }}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

export function TaskPreviewSheet({
  visible,
  task,
  onClose,
  onEdit,
  onComplete,
}: Props) {
  if (!task) return null;

  const reminder = isReminderTask(task);
  const overdue = isTaskOverdue(task);
  const kindLabel = reminder ? "Reminder" : "Task";
  const headerSubtitle = [kindLabel, overdue ? "Overdue" : null].filter(Boolean).join(" · ");
  const description = isFeedbackTaskDescription(task.description)
    ? ""
    : (task.description?.trim() ?? "");
  const assignees = (task.assignments ?? []).filter((assignment) => assignment.user?.name);
  const lead = assignees[0]?.user;
  const assigneeLabel = reminder && assignees.length === 0
    ? "Only you"
    : assignees.length === 0
      ? null
      : assignees.length === 1
        ? lead?.name ?? ""
        : `${lead?.name ?? "Assigned"} +${assignees.length - 1}`;

  return (
    <AlenioBottomSheet
      visible={visible}
      title={task.title}
      subtitle={headerSubtitle}
      onClose={onClose}
      compact
      showCloseButton
      testID="task-preview"
      headerRight={
        onEdit ? (
          <Pressable
            onPress={onEdit}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={reminder ? "Edit reminder" : "Edit task"}
            testID="task-preview-edit"
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Pencil size={16} color="#6d28d9" strokeWidth={2.2} />
          </Pressable>
        ) : null
      }
      footer={
        onComplete && task.status !== "done" ? (
          <Pressable
            onPress={onComplete}
            style={alenioSheetStyles.primaryButton}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${task.title} complete`}
            testID="task-preview-complete"
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Check size={14} color="#FFFFFF" strokeWidth={2.6} />
              <Text style={alenioSheetStyles.primaryButtonText}>Mark complete</Text>
            </View>
          </Pressable>
        ) : undefined
      }
    >
      <View>
        <DetailRow icon={CalendarDays} label="Date" value={formatTaskDate(task.dueDate)} />
        <DetailRow
          icon={Clock3}
          label="Time"
          value={formatTaskTime(task)}
          valueColor={overdue ? "#9F1239" : undefined}
        />
      </View>

      {description ? (
        <AlenioSheetCard compact tint="slate">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
            <FileText size={15} color={colors.textSecondary} strokeWidth={2} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted }}>
                DESCRIPTION
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  lineHeight: 17,
                  color: colors.textSecondary,
                }}
              >
                {description}
              </Text>
            </View>
          </View>
        </AlenioSheetCard>
      ) : null}

      {assigneeLabel ? (
        <View
          style={{
            marginTop: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
          }}
        >
          {lead ? (
            <UserAvatar user={lead} size={30} radius={15} resetKey={lead.id} />
          ) : (
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.brandSoft,
              }}
            >
              <UserRound size={15} color={colors.brand} strokeWidth={2.1} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted }}>
              ASSIGNED
            </Text>
            <Text
              style={{
                marginTop: 1,
                fontSize: 12,
                fontWeight: "600",
                color: colors.textPrimary,
              }}
              numberOfLines={1}
            >
              {assigneeLabel}
            </Text>
          </View>
          <UserRound size={15} color={colors.textMuted} />
        </View>
      ) : null}
    </AlenioBottomSheet>
  );
}
