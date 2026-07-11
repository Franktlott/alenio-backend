import { View, Text, Pressable } from "react-native";
import { ArrowUpDown, CalendarDays, ChevronDown, Flag, User } from "lucide-react-native";
import type { FilterPicker, WorkspaceFiltersState } from "./workspace-types";
import {
  assignedToLabel,
  dueDateLabel,
  priorityLabel,
  sortLabel,
} from "./workspace-utils";
import { WS } from "./workspace-ui";

type Props = {
  filters: WorkspaceFiltersState;
  selectedDay: string | null;
  onOpenPicker: (picker: FilterPicker) => void;
  directReportsDisabled: boolean;
  unassignedDisabled: boolean;
  entireTeamDisabled: boolean;
};

function FilterButton({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: WS.surface,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        minHeight: 34,
      }}
    >
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: WS.meta, color: WS.faint, fontWeight: "500", lineHeight: 12 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ fontSize: WS.body, color: WS.ink, fontWeight: "600", lineHeight: 14 }} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <ChevronDown size={11} color={WS.faint} />
    </Pressable>
  );
}

export function TaskFilterBar({ filters, selectedDay, onOpenPicker }: Props) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      <FilterButton
        icon={<User size={12} color={WS.muted} />}
        label="Assigned"
        value={assignedToLabel(filters.assignedTo)}
        onPress={() => onOpenPicker("assignedTo")}
      />
      <FilterButton
        icon={<CalendarDays size={12} color={WS.muted} />}
        label="Due"
        value={dueDateLabel(filters.dueDate, selectedDay)}
        onPress={() => onOpenPicker("dueDate")}
      />
      <FilterButton
        icon={<Flag size={12} color={WS.muted} />}
        label="Priority"
        value={priorityLabel(filters.priority)}
        onPress={() => onOpenPicker("priority")}
      />
      <FilterButton
        icon={<ArrowUpDown size={12} color={WS.muted} />}
        label="Sort"
        value={sortLabel(filters.sort)}
        onPress={() => onOpenPicker("sort")}
      />
    </View>
  );
}
