import { ScrollView, Text, View } from "react-native";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { AlenioList, AlenioListRow, Button } from "@/components/ui";
import { UserAvatar } from "@/components/UserAvatar";
import type { Task } from "@/lib/types";

type Assignment = Task["assignments"][number];

type Props = {
  visible: boolean;
  assignments: Assignment[];
  currentUserId?: string | null;
  taskTitle?: string | null;
  canManage?: boolean;
  onClose: () => void;
  onManage?: () => void;
};

function displayName(assignment: Assignment, currentUserId?: string | null) {
  const base = assignment.user.name?.trim() || assignment.user.email || "Teammate";
  if (assignment.userId === currentUserId) return `${base} (You)`;
  return base;
}

/**
 * Read-only list of who is on a task. Manage opens the existing reassign /
 * detail flow when the caller has permission — no new APIs.
 */
export function AssigneesSheet({
  visible,
  assignments,
  currentUserId,
  taskTitle,
  canManage = false,
  onClose,
  onManage,
}: Props) {
  const count = assignments.length;
  const ordered = orderByViewerFirst(assignments, currentUserId);

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Assignees"
      subtitle={
        count === 0
          ? "No one assigned yet."
          : `${count} ${count === 1 ? "person" : "people"}${taskTitle ? ` · ${taskTitle}` : ""}`
      }
      onClose={onClose}
      showCloseButton
      compact
      scrollEnabled={false}
      testID="assignees-sheet"
      footer={
        canManage && onManage ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            label="Manage assignees"
            onPress={onManage}
            testID="assignees-sheet-manage"
          />
        ) : undefined
      }
    >
      {count === 0 ? (
        <View style={{ paddingVertical: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B" }}>
            No assignees
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ maxHeight: 360 }}
          contentContainerStyle={{ paddingBottom: 4 }}
          showsVerticalScrollIndicator={count > 6}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <AlenioList>
            {ordered.map((assignment) => (
              <AlenioListRow
                key={assignment.id}
                leading={
                  <UserAvatar
                    user={assignment.user}
                    size={36}
                    radius={18}
                    fontSize={12}
                    resetKey={assignment.userId}
                  />
                }
                title={displayName(assignment, currentUserId)}
                testID={`assignees-sheet-row-${assignment.userId}`}
              />
            ))}
          </AlenioList>
        </ScrollView>
      )}
    </AlenioBottomSheet>
  );
}

function orderByViewerFirst(
  assignments: Assignment[],
  currentUserId?: string | null,
): Assignment[] {
  if (!currentUserId) return [...assignments];
  const mine = assignments.filter((a) => a.userId === currentUserId);
  if (!mine.length) return [...assignments];
  return [...mine, ...assignments.filter((a) => a.userId !== currentUserId)];
}
