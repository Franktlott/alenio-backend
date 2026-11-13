import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { SPLIT_MIN_WIDTH } from "@/lib/adaptive-layout";
import type { Task } from "@/lib/types";

const SIZE = 26;
const OVERLAP = 8;

type Assignment = Task["assignments"][number];

type Props = {
  assignments: Task["assignments"] | undefined;
  currentUserId?: string | null;
  /** Dims the whole stack to match a completed row. */
  faded?: boolean;
  /** Opens the Assignees sheet; stops the parent row press. */
  onPress?: () => void;
};

/**
 * The people on a task, as faces.
 *
 * Your own face always sorts first so it survives the cut. Mobile shows two
 * faces + overflow; wider screens can show three.
 */
export function AssigneeStack({
  assignments,
  currentUserId,
  faded,
  onPress,
}: Props) {
  const { width } = useWindowDimensions();
  const maxFaces = width >= SPLIT_MIN_WIDTH ? 3 : 2;

  if (!assignments?.length) return null;

  const ordered = orderByViewerFirst(assignments, currentUserId);
  const faces = ordered.slice(0, maxFaces);
  const overflow = ordered.length - faces.length;

  const stack = (
    <View
      style={[styles.row, faded ? styles.faded : null]}
      accessible
      accessibilityLabel={describe(ordered, currentUserId)}
      testID="task-row-assignees"
    >
      {faces.map((assignment, index) => {
        const isViewer = assignment.userId === currentUserId;
        return (
          <View
            key={assignment.id}
            style={[
              styles.face,
              index > 0 ? { marginLeft: -OVERLAP } : null,
              isViewer ? styles.viewerFace : null,
            ]}
          >
            <UserAvatar
              user={assignment.user}
              size={SIZE}
              radius={SIZE / 2}
              fontSize={10}
              resetKey={assignment.userId}
            />
          </View>
        );
      })}
      {overflow > 0 ? (
        <View style={[styles.face, styles.overflow, { marginLeft: -OVERLAP }]}>
          <Text style={styles.overflowText}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return stack;

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation?.();
        onPress();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`${describe(ordered, currentUserId)}. Show assignees`}
      style={styles.hit}
    >
      {stack}
    </Pressable>
  );
}

function orderByViewerFirst(
  assignments: Task["assignments"],
  currentUserId?: string | null,
): Assignment[] {
  if (!currentUserId) return [...assignments];
  const mine = assignments.filter((a) => a.userId === currentUserId);
  if (!mine.length) return [...assignments];
  return [...mine, ...assignments.filter((a) => a.userId !== currentUserId)];
}

function describe(
  assignments: Assignment[],
  currentUserId?: string | null,
): string {
  const names = assignments.map((assignment) =>
    assignment.userId === currentUserId
      ? "you"
      : assignment.user.name?.trim() || "a teammate",
  );
  if (names.length === 1) return `Assigned to ${names[0]}`;
  return `Assigned to ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const styles = StyleSheet.create({
  hit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  faded: { opacity: 0.45 },
  face: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  viewerFace: { borderColor: "#6d28d9" },
  overflow: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8EBF0",
  },
  overflowText: { fontSize: 9, fontWeight: "800", color: "#5B6883" },
});
