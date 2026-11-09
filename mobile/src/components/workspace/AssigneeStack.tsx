import { StyleSheet, Text, View } from "react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { Task } from "@/lib/types";

/** Faces shown before the rest collapse into a +N chip. */
const MAX_FACES = 2;
const SIZE = 22;
/** Negative gap, so faces tuck behind each other like a stacked deck. */
const OVERLAP = 7;

type Assignment = Task["assignments"][number];

type Props = {
  assignments: Task["assignments"] | undefined;
  currentUserId?: string | null;
  /** Dims the whole stack to match a completed row. */
  faded?: boolean;
};

/**
 * The people on a task, as faces.
 *
 * Your own face always sorts first so it survives the cut to two, which is the
 * whole point: a row is yours or it is not, and that has to be readable
 * without opening it.
 */
export function AssigneeStack({ assignments, currentUserId, faded }: Props) {
  if (!assignments?.length) return null;

  const ordered = orderByViewerFirst(assignments, currentUserId);
  const faces = ordered.slice(0, MAX_FACES);
  const overflow = ordered.length - faces.length;

  return (
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
              // A ring in the brand colour marks which face is you.
              isViewer ? styles.viewerFace : null,
            ]}
          >
            <UserAvatar
              user={assignment.user}
              size={SIZE}
              radius={SIZE / 2}
              fontSize={9}
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
  row: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  faded: { opacity: 0.45 },
  face: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    // Matches the row behind it, so the cut-out reads as a gap not an outline.
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  viewerFace: { borderColor: "#4361EE" },
  overflow: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8EBF0",
  },
  overflowText: { fontSize: 9, fontWeight: "800", color: "#5B6883" },
});
