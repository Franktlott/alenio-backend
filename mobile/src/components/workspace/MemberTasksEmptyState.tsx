import { ClipboardList } from "lucide-react-native";
import { EmptyState, tintInk } from "@/components/ui";

export function MemberTasksEmptyState() {
  return (
    <EmptyState
      testID="member-tasks-empty-state"
      tint="lavender"
      icon={<ClipboardList size={18} color={tintInk("lavender")} strokeWidth={2.2} />}
      title="You're all set"
      body="You don't have any tasks right now. When your leader assigns tasks, they'll appear here."
      style={{
        alignSelf: "stretch",
        paddingTop: 10,
        paddingBottom: 8,
        paddingVertical: 0,
      }}
    />
  );
}
