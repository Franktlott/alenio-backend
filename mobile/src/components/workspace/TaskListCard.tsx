import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { Task } from "@/lib/types";
import { TaskRow } from "./TaskRow";
import { TasksEmptyState } from "./TasksEmptyState";
import { colors, radii, space, surfaces, typography } from "@/theme";
import { WS } from "./workspace-ui";
import { scheduleSectionColor } from "./workspace-utils";

function SkeletonRow() {
  return (
    <View
      style={{
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
      }}
    >
      <View
        style={{
          height: 8,
          width: "62%",
          backgroundColor: colors.borderStrong,
          borderRadius: 4,
          marginBottom: 4,
        }}
      />
      <View
        style={{
          height: 7,
          width: "40%",
          backgroundColor: colors.divider,
          borderRadius: 4,
        }}
      />
    </View>
  );
}

export type TaskListSection = {
  id: string;
  title: string;
  titleColor?: string;
  tasks: Task[];
  totalCount?: number;
  onShowAll?: () => void;
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
  currentUserId?: string | null;
  /** The task open in the detail pane, so the list shows where it came from. */
  selectedTaskId?: string | null;
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
  currentUserId?: string | null,
  selectedTaskId?: string | null,
) {
  return (
    <View>
      {tasks.map((task, index) => (
        <TaskRow
          key={task.id}
          task={task}
          isLast={index === tasks.length - 1}
          selected={task.id === selectedTaskId}
          currentUserId={currentUserId}
          onToggle={() => onToggle(task)}
          onPress={() => onPress(task)}
          onLongPress={onLongPress ? () => onLongPress(task) : undefined}
        />
      ))}
    </View>
  );
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
  currentUserId,
  selectedTaskId,
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
      style={
        sectionList
          ? { width: "100%", gap: 6 }
          : {
              ...surfaces.groupedCard,
              width: "100%",
              ...(loading || loadError ? { minHeight: 72 } : {}),
            }
      }
    >
      {loading ? (
        <>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </>
      ) : loadError ? (
        <View style={{ alignItems: "center", padding: space.xl }}>
          <Text style={{ ...typography.rowTitle, marginBottom: 6 }}>
            Couldn't load tasks
          </Text>
          <Text
            style={{
              ...typography.supporting,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            {loadError}
          </Text>
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
              <Text style={{ color: "white", fontWeight: "600" }}>
                Try again
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : sectionList ? (
        sectionList.map((section) => (
          <View
            key={section.id}
            style={{
              gap: 2,
            }}
          >
            <View
              style={{
                paddingHorizontal: 2,
                paddingTop: 2,
                paddingBottom: 1,
                backgroundColor: "transparent",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    lineHeight: 15,
                    fontWeight: "700",
                    // Completed and archived group by week, so those headings
                    // keep the neutral colour.
                    color: scheduleSectionColor(section.id) ?? "#334155",
                    letterSpacing: 0.2,
                  }}
                >
                  {section.title}
                </Text>
                {typeof section.totalCount === "number" ? (
                  <Text
                    style={{
                      fontSize: 12,
                      lineHeight: 15,
                      fontWeight: "500",
                      color: WS.faint,
                    }}
                  >
                    {section.totalCount}
                  </Text>
                ) : null}
              </View>
              {section.onShowAll ? (
                <Pressable
                  onPress={section.onShowAll}
                  hitSlop={8}
                  testID={`task-section-show-all-${section.id}`}
                >
                  <Text
                    style={{ fontSize: 12, fontWeight: "500", color: WS.muted }}
                  >
                    Show all
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {renderTaskRows(
              section.tasks,
              onToggle,
              onPress,
              onLongPress,
              currentUserId,
              selectedTaskId,
            )}
          </View>
        ))
      ) : (
        renderTaskRows(
          tasks,
          onToggle,
          onPress,
          onLongPress,
          currentUserId,
          selectedTaskId,
        )
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
