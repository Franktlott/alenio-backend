import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import { Flag } from "lucide-react-native";
import type { Task } from "@/lib/types";
import { isFeedbackTaskDescription } from "@/lib/one-on-one-feedback";
import { WS } from "./workspace-ui";

const PRIORITY_CONFIG = {
  urgent: { label: "High", flagColor: "#DC2626", text: "#DC2626" },
  high: { label: "High", flagColor: "#DC2626", text: "#DC2626" },
  medium: { label: "Medium", flagColor: "#F59E0B", text: "#B45309" },
  low: { label: "Low", flagColor: "#16A34A", text: "#15803D" },
};

function initials(name?: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

function avatarColor(name?: string | null): string {
  const palette = ["#7C3AED", "#4361EE", "#0EA5E9", "#10B981", "#F59E0B"];
  const code = (name ?? "").split("").reduce((n, c) => n + c.charCodeAt(0), 0);
  return palette[code % palette.length];
}

type Props = {
  task: Task;
  onToggle: () => void;
  onPress: () => void;
  onLongPress?: () => void;
  showSeparator?: boolean;
};

export function TaskRow({ task, onToggle, onPress, onLongPress, showSeparator = true }: Props) {
  const isDone = task.status === "done";
  const isLocked = isDone && isFeedbackTaskDescription(task.description);
  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
  const assignee = task.assignments?.[0]?.user;
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const completed = task.completedAt ? new Date(task.completedAt) : null;

  const { statusText, dateText, statusColor } = (() => {
    if (isDone && completed) {
      return {
        statusText: "Completed",
        dateText: completed.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        statusColor: "#64748B",
      };
    }
    if (!due) {
      return { statusText: "No due date", dateText: null as string | null, statusColor: "#64748B" };
    }
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const time = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const dateOnly = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (dueStart.getTime() === todayStart.getTime()) {
      return { statusText: "Due today", dateText: time, statusColor: "#4361EE" };
    }
    if (dueStart < todayStart) {
      return { statusText: "Overdue", dateText: dateOnly, statusColor: "#EF4444" };
    }
    return { statusText: "Due", dateText: `${dateOnly} • ${time}`, statusColor: "#0F172A" };
  })();

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400} testID="task-row">
      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          paddingVertical: 8,
          opacity: isDone ? 0.72 : 1,
          borderBottomWidth: showSeparator ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: "#E2E8F0",
        }}
      >
        <Pressable
          onPress={isLocked ? undefined : onToggle}
          disabled={isLocked}
          hitSlop={6}
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: isDone ? "#10B981" : "#CBD5E1",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 8,
            backgroundColor: isDone ? "#D1FAE5" : "transparent",
          }}
        >
          {isDone ? <Text style={{ color: "#10B981", fontSize: 10, fontWeight: "700" }}>✓</Text> : null}
        </Pressable>

        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: WS.title,
              fontWeight: "600",
              color: isDone ? WS.faint : WS.ink,
              textDecorationLine: isDone ? "line-through" : "none",
              lineHeight: 16,
            }}
          >
            {task.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: WS.body, color: statusColor, lineHeight: 14 }}>
              {statusText}
            </Text>
            {dateText ? (
              <>
                <Text style={{ fontSize: WS.body, color: WS.faint, lineHeight: 14 }}> • </Text>
                <Text numberOfLines={1} style={{ fontSize: WS.body, color: WS.ink, lineHeight: 14, flexShrink: 1 }}>
                  {dateText}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {assignee ? (
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: assignee.image ? "#E2E8F0" : avatarColor(assignee.name),
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {assignee.image ? (
                <Image source={{ uri: assignee.image }} style={{ width: 20, height: 20 }} resizeMode="cover" />
              ) : (
                <Text style={{ color: "white", fontSize: 7, fontWeight: "700" }}>{initials(assignee.name)}</Text>
              )}
            </View>
          ) : null}
          <View style={{ alignItems: "flex-end", minWidth: 40 }}>
            <Flag size={10} color={priority.flagColor} fill={priority.flagColor} />
            <Text style={{ fontSize: 9, fontWeight: "600", color: priority.text, marginTop: 0 }}>{priority.label}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
