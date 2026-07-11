import { View, Text, Pressable } from "react-native";
import { Filter } from "lucide-react-native";
import type { WorkspaceFiltersState } from "./workspace-types";
import {
  assignedToLabel,
  dueDateLabel,
  isDefaultAssignedTo,
  isDefaultDueDate,
  isDefaultPriority,
  isDefaultSort,
  priorityLabel,
} from "./workspace-utils";

export const FILTER_CHIPS_MIN_HEIGHT = 0;

type Chip = { key: string; label: string; onClear: () => void };

type Props = {
  filters: WorkspaceFiltersState;
  selectedDay: string | null;
  onClearAssignedTo: () => void;
  onClearDueDate: () => void;
  onClearPriority: () => void;
  onClearAll: () => void;
};

export function ActiveFilterChips({
  filters,
  selectedDay,
  onClearAssignedTo,
  onClearDueDate,
  onClearPriority,
  onClearAll,
}: Props) {
  const chips: Chip[] = [];

  if (!isDefaultAssignedTo(filters.assignedTo)) {
    chips.push({
      key: "assigned",
      label: `Assigned to: ${assignedToLabel(filters.assignedTo)}`,
      onClear: onClearAssignedTo,
    });
  }
  if (!isDefaultDueDate(filters.dueDate, selectedDay)) {
    chips.push({
      key: "due",
      label: `Due: ${dueDateLabel(filters.dueDate, selectedDay)}`,
      onClear: onClearDueDate,
    });
  }
  if (!isDefaultPriority(filters.priority)) {
    chips.push({
      key: "priority",
      label: `Priority: ${priorityLabel(filters.priority)}`,
      onClear: onClearPriority,
    });
  }

  const hasChips = chips.length > 0;

  return (
    <View style={{ minHeight: hasChips ? 28 : 0, justifyContent: "center" }}>
      {hasChips ? (
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
          <Filter size={10} color="#94A3B8" />
          <Text style={{ fontSize: 10, color: "#94A3B8", fontWeight: "600", marginRight: 2 }}>Filters:</Text>
          {chips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={chip.onClear}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#EEF2FF",
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "600", color: "#4361EE" }}>{chip.label} ×</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClearAll} hitSlop={6}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: "#4361EE" }}>Clear all</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
