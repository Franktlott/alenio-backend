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

export type TaskListSection = {
  id: string;
  title: string;
  tasks: Task[];
};

type Props = {
  tasks?: Task[];
  sections?: TaskListSection[];
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

function renderTaskRows(
  tasks: Task[],
  onToggle: (task: Task) => void,
  onPress: (task: Task) => void,
  onLongPress?: (task: Task) => void,
  isLastSection = true,
) {
  return tasks.map((task, index) => (
    <TaskRow
      key={task.id}
      task={task}
      onToggle={() => onToggle(task)}
      onPress={() => onPress(task)}
      onLongPress={onLongPress ? () => onLongPress(task) : undefined}
      showSeparator={index < tasks.length - 1 || !isLastSection}
    />
  ));
}

export function TaskListCard({
  tasks = [],
  sections,
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
  const sectionList = sections?.filter((s) => s.tasks.length > 0) ?? null;
  const taskCount = sectionList
    ? sectionList.reduce((sum, s) => sum + s.tasks.length, 0)
    : tasks.length;

  if (!loading && !loadError && taskCount === 0) {
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
      ) : sectionList ? (
        sectionList.map((section, sectionIndex) => (
          <View key={section.id}>
            <View
              style={{
                paddingHorizontal: 12,
                paddingTop: sectionIndex === 0 ? 10 : 12,
                paddingBottom: 4,
                backgroundColor: sectionIndex === 0 ? WS.surface : "#F8FAFC",
                borderTopWidth: sectionIndex === 0 ? 0 : 1,
                borderTopColor: "#F1F5F9",
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748B", letterSpacing: 0.4, textTransform: "uppercase" }}>
                {section.title}
              </Text>
            </View>
            {renderTaskRows(
              section.tasks,
              onToggle,
              onPress,
              onLongPress,
              sectionIndex === sectionList.length - 1,
            )}
          </View>
        ))
      ) : (
        renderTaskRows(tasks, onToggle, onPress, onLongPress)
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
