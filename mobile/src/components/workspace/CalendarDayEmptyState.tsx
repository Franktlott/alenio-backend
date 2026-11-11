import { Plus } from "lucide-react-native";
import { buttonInk, EmptyState } from "@/components/ui";

type Props = {
  dayLabel?: string;
  onAdd?: () => void;
};

/** Calm empty state for the selected calendar day. */
export function CalendarDayEmptyState({ onAdd }: Props) {
  return (
    <EmptyState
      title="Nothing scheduled"
      body="No events, tasks, or holidays for this day."
      actionLabel={onAdd ? "Add event" : undefined}
      actionIcon={<Plus size={13} color={buttonInk("soft")} strokeWidth={2.6} />}
      onAction={onAdd}
      testID="calendar-day-empty-state"
      style={{ flex: 1, alignSelf: "stretch", width: "100%", minHeight: 72, justifyContent: "center", paddingVertical: 8 }}
    />
  );
}
