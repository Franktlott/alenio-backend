import { View, Text, Pressable, ActivityIndicator } from "react-native";
import type { Task } from "@/lib/types";
import { TaskRow } from "./TaskRow";
import { TasksEmptyState } from "./TasksEmptyState";
import { WS } from "./workspace-ui";

function SkeletonRow() {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
      <View style={{ height: 8, width: "62%", backgroundColor: "#E2E8F0", borderRadius: 4, marginBottom: 4 }} />
      <View style={{ height: 7, width: "40%", backgroundColor: "#F1F5F9", borderRadius: 4 }} />
    </View>
  );
}

type Props = {
  tasks: Task[];
  loading: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  onToggle: (task: Task) => void;
  onPress: (task: Task) => void;
  onLongPress?: (task: Task) => void;
  emptyTitle: string;
  emptyAccentTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  footer?: React.ReactNode;
};

export function TaskListCard({
  tasks,
  loading,
  loadError,
  onRetry,
  onToggle,
  onPress,
  onLongPress,
  emptyTitle,
  emptyAccentTitle,
  emptySubtitle,
  emptyActionLabel,
  onEmptyAction,
  footer,
}: Props) {
  if (!loading && !loadError && tasks.length === 0) {
    return (
      <TasksEmptyState
        title={emptyTitle}
        accentTitle={emptyAccentTitle}
        subtitle={emptySubtitle}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <View
      style={{
        width: "100%",
        alignSelf: "stretch",
        backgroundColor: WS.surface,
        borderRadius: WS.cardRadius,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: WS.cardBorder,
        ...(loading || loadError ? { minHeight: 72 } : {}),
      }}
    >
      {loading ? (
        <>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </>
      ) : loadError ? (
        <View style={{ alignItems: "center", padding: 24 }}>
          <Text style={{ fontSize: WS.title + 2, fontWeight: WS.titleWeight, color: WS.ink, marginBottom: 6 }}>Couldn't load tasks</Text>
          <Text style={{ fontSize: WS.title, color: WS.muted, textAlign: "center", marginBottom: 12 }}>{loadError}</Text>
          {onRetry ? (
            <Pressable onPress={onRetry} style={{ backgroundColor: WS.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ color: "white", fontWeight: "600" }}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        tasks.map((task, index) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={() => onToggle(task)}
            onPress={() => onPress(task)}
            onLongPress={onLongPress ? () => onLongPress(task) : undefined}
            showSeparator={index < tasks.length - 1}
          />
        ))
      )}
      {footer}
    </View>
  );
}

export function TaskListFooterSpinner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={{ paddingVertical: 12, alignItems: "center" }}>
      <ActivityIndicator color="#4361EE" size="small" />
    </View>
  );
}
