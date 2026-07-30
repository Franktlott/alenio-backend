import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import type { Task } from "@/lib/types";
import { TaskRow } from "./TaskRow";
import { TasksEmptyState } from "./TasksEmptyState";
import { colors, radii, space, surfaces, typography } from "@/theme";

function SkeletonRow() {
  return (
    <View style={{ paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
      <View style={{ height: 8, width: "62%", backgroundColor: colors.borderStrong, borderRadius: 4, marginBottom: 4 }} />
      <View style={{ height: 7, width: "40%", backgroundColor: colors.divider, borderRadius: 4 }} />
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
        ...surfaces.groupedCard,
        width: "100%",
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
        <View style={{ alignItems: "center", padding: space.xl }}>
          <Text style={{ ...typography.rowTitle, marginBottom: 6 }}>Couldn't load tasks</Text>
          <Text style={{ ...typography.supporting, textAlign: "center", marginBottom: 12 }}>{loadError}</Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              style={{
                backgroundColor: colors.brand,
                borderRadius: radii.md,
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : sectionList ? (
        sectionList.map((section, sectionIndex) => (
          <View key={section.id}>
            <View
              style={{
                paddingHorizontal: space.md,
                paddingTop: sectionIndex === 0 ? space.sm + 2 : space.md,
                paddingBottom: space.xs,
                backgroundColor: sectionIndex === 0 ? colors.surface : colors.pageBg,
                borderTopWidth: sectionIndex === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.divider,
              }}
            >
              <Text style={typography.sectionLabel}>{section.title}</Text>
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
    <View style={{ paddingVertical: space.md, alignItems: "center" }}>
      <ActivityIndicator color={colors.brand} size="small" />
    </View>
  );
}
