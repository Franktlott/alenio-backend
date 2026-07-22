import { Modal, Pressable, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Check } from "lucide-react-native";
import type { TeamMember } from "@/lib/types";
import type { AssignedToFilter, FilterPicker, WorkspaceFiltersState } from "./workspace-types";

type Props = {
  picker: FilterPicker;
  filters: WorkspaceFiltersState;
  members: TeamMember[];
  isLeader: boolean;
  onClose: () => void;
  onApply: (next: Partial<WorkspaceFiltersState>) => void;
};

function SheetOption({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: selected ? "#F5F7FF" : "transparent",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: selected ? "#4361EE" : "#0F172A" }}>{label}</Text>
      {selected ? <Check size={16} color="#4361EE" /> : null}
    </TouchableOpacity>
  );
}

export function WorkspaceFilterPicker({ picker, filters, members, isLeader, onClose, onApply }: Props) {
  if (!picker) return null;

  const title =
    picker === "assignedTo"
      ? "Assigned To"
      : picker === "dueDate"
        ? "Due Date"
        : picker === "priority"
          ? "Priority"
          : "Sort";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 32, maxHeight: "70%" }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.8, paddingHorizontal: 20, marginBottom: 8 }}>{title.toUpperCase()}</Text>
            <ScrollView>
              {picker === "assignedTo" ? (
                <>
                  <SheetOption label="Me" selected={filters.assignedTo === "me"} onPress={() => onApply({ assignedTo: "me" })} />
                  <SheetOption
                    label="My Direct Reports"
                    selected={filters.assignedTo === "direct_reports"}
                    onPress={() => onApply({ assignedTo: "direct_reports" })}
                    disabled={!isLeader}
                  />
                  <SheetOption
                    label="Entire Team"
                    selected={filters.assignedTo === "entire_team"}
                    onPress={() => onApply({ assignedTo: "entire_team" })}
                    disabled={!isLeader}
                  />
                  <SheetOption
                    label="Unassigned"
                    selected={filters.assignedTo === "unassigned"}
                    onPress={() => onApply({ assignedTo: "unassigned" })}
                    disabled={!isLeader}
                  />
                  {isLeader
                    ? members
                        .filter((m) => m.userId)
                        .map((m) => (
                          <SheetOption
                            key={m.userId}
                            label={m.user.name ?? "Member"}
                            selected={typeof filters.assignedTo === "object" && filters.assignedTo.memberId === m.userId}
                            onPress={() => onApply({ assignedTo: { memberId: m.userId, memberName: m.user.name ?? "Member" } })}
                          />
                        ))
                    : null}
                </>
              ) : null}
              {picker === "dueDate" ? (
                <>
                  <SheetOption label="All dates" selected={filters.dueDate === "all"} onPress={() => onApply({ dueDate: "all" })} />
                  <SheetOption label="Selected day" selected={filters.dueDate === "calendar_day"} onPress={() => onApply({ dueDate: "calendar_day" })} />
                  <SheetOption label="Today" selected={filters.dueDate === "today"} onPress={() => onApply({ dueDate: "today" })} />
                  <SheetOption label="Overdue" selected={filters.dueDate === "overdue"} onPress={() => onApply({ dueDate: "overdue" })} />
                </>
              ) : null}
              {picker === "priority" ? (
                <>
                  {(["all", "urgent", "high", "medium", "low"] as const).map((p) => (
                    <SheetOption
                      key={p}
                      label={p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
                      selected={filters.priority === p}
                      onPress={() => onApply({ priority: p })}
                    />
                  ))}
                </>
              ) : null}
              {picker === "sort" ? (
                <>
                  {(filters.statusTab === "completed" || filters.statusTab === "archived"
                    ? (["completed", "priority", "due"] as const)
                    : (["due", "priority"] as const)
                  ).map((s) => (
                    <SheetOption
                      key={s}
                      label={s === "due" ? "Due Date" : s === "priority" ? "Priority" : "Completion"}
                      selected={filters.sort === s}
                      onPress={() => onApply({ sort: s })}
                    />
                  ))}
                </>
              ) : null}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
