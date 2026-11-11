import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  Archive,
  CalendarDays,
  Check,
  CheckCircle2,
  ListTodo,
  Search,
  User,
} from "lucide-react-native";
import type { TeamMember } from "@/lib/types";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import type {
  AssignedToFilter,
  DueDateFilter,
  FilterPicker,
  WorkspaceFiltersState,
} from "./workspace-types";
import { DEFAULT_WORKSPACE_FILTERS } from "./workspace-types";
import { colors } from "@/theme";

type Props = {
  picker: FilterPicker;
  filters: WorkspaceFiltersState;
  members: TeamMember[];
  isLeader: boolean;
  onClose: () => void;
  onApply: (next: WorkspaceFiltersState) => void;
};

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Chip({
  label,
  selected,
  onPress,
  icon,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.chip,
        selected ? styles.chipSelected : null,
        disabled ? styles.chipDisabled : null,
      ]}
    >
      {selected ? (
        <Check size={12} color={colors.brand} strokeWidth={2.5} />
      ) : (
        icon
      )}
      <Text style={[styles.chipText, selected ? styles.selectedText : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function WorkspaceFilterPicker({
  picker,
  filters,
  members,
  isLeader,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState(filters);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const visible = picker === "filterView";

  useEffect(() => {
    if (!visible) return;
    setDraft(filters);
    setMemberPickerOpen(typeof filters.assignedTo === "object");
    setMemberQuery("");
  }, [visible, filters]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return members
      .filter((member) => member.userId)
      .filter((member) => {
        if (!q) return true;
        return (
          (member.user.name ?? "").toLowerCase().includes(q) ||
          member.user.email.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        (a.user.name ?? a.user.email).localeCompare(
          b.user.name ?? b.user.email,
        ),
      );
  }, [memberQuery, members]);

  const setAssignedTo = (assignedTo: AssignedToFilter) =>
    setDraft((current) => ({ ...current, assignedTo }));
  const setStatusTab = (statusTab: WorkspaceFiltersState["statusTab"]) =>
    setDraft((current) => ({ ...current, statusTab }));
  const setDueDate = (dueDate: DueDateFilter) =>
    setDraft((current) => ({ ...current, dueDate }));
  const reset = () => {
    setDraft((current) => ({
      ...current,
      statusTab: DEFAULT_WORKSPACE_FILTERS.statusTab,
      assignedTo: DEFAULT_WORKSPACE_FILTERS.assignedTo,
      dueDate: DEFAULT_WORKSPACE_FILTERS.dueDate,
      priority: DEFAULT_WORKSPACE_FILTERS.priority,
    }));
    setMemberPickerOpen(false);
    setMemberQuery("");
  };

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Filters"
      subtitle="Narrow down the tasks shown."
      onClose={onClose}
      bodyHeightRatio={0.48}
      compact
      showScrollIndicator
      testID="workspace-filter-view-sheet"
      headerRight={
        <Pressable
          onPress={reset}
          hitSlop={10}
          testID="workspace-filters-reset"
        >
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
      }
      footer={
        <Pressable
          onPress={() => {
            onApply(draft);
            onClose();
          }}
          style={styles.applyButton}
          testID="workspace-filters-apply"
        >
          <Text style={styles.applyText}>Apply Filters</Text>
        </Pressable>
      }
    >
      <SectionTitle>VIEW</SectionTitle>
      <View style={styles.chipRow}>
        <Chip
          label="Active"
          selected={draft.statusTab === "active"}
          onPress={() => setStatusTab("active")}
          icon={<ListTodo size={13} color="#7B8799" />}
        />
        <Chip
          label="Completed"
          selected={draft.statusTab === "completed"}
          onPress={() => setStatusTab("completed")}
          icon={<CheckCircle2 size={13} color="#7B8799" />}
        />
        <Chip
          label="Archived"
          selected={draft.statusTab === "archived"}
          onPress={() => setStatusTab("archived")}
          icon={<Archive size={13} color="#7B8799" />}
        />
      </View>

      <SectionTitle>ASSIGNED TO</SectionTitle>
      <View style={styles.chipRow}>
        <Chip
          label="Assigned to Me"
          selected={draft.assignedTo === "me" && !memberPickerOpen}
          onPress={() => {
            setAssignedTo("me");
            setMemberPickerOpen(false);
          }}
          icon={<User size={13} color="#7B8799" />}
        />
        <Chip
          label="Anyone"
          selected={draft.assignedTo === "entire_team" && !memberPickerOpen}
          onPress={() => {
            setAssignedTo("entire_team");
            setMemberPickerOpen(false);
          }}
          disabled={!isLeader}
        />
        <Chip
          label="Specific Person…"
          selected={memberPickerOpen || typeof draft.assignedTo === "object"}
          onPress={() => setMemberPickerOpen(true)}
          disabled={!isLeader}
        />
      </View>

      {memberPickerOpen && isLeader ? (
        <View style={styles.memberPicker}>
          <View style={styles.searchRow}>
            <Search size={15} color="#8A96A8" />
            <TextInput
              value={memberQuery}
              onChangeText={setMemberQuery}
              placeholder="Search workspace members"
              placeholderTextColor="#9AA5B5"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {filteredMembers.slice(0, 8).map((member) => {
            const selected =
              typeof draft.assignedTo === "object" &&
              draft.assignedTo.memberId === member.userId;
            return (
              <Pressable
                key={member.userId}
                onPress={() => {
                  setAssignedTo({
                    memberId: member.userId,
                    memberName: member.user.name ?? "Member",
                  });
                  setMemberPickerOpen(false);
                }}
                style={styles.memberRow}
              >
                <UserAvatar
                  user={member.user}
                  size={32}
                  radius={16}
                  backgroundColor="#EFE9FF"
                  textColor={colors.brand}
                  fontSize={11}
                />
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.user.name ?? member.user.email}
                </Text>
                {selected ? <Check size={16} color={colors.brand} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <SectionTitle>DUE DATE</SectionTitle>
      <View style={styles.chipRow}>
        {(
          [
            ["all", "Any"],
            ["today", "Today"],
            ["tomorrow", "Tomorrow"],
            ["this_week", "This Week"],
            ["overdue", "Overdue"],
          ] as const
        ).map(([value, label]) => (
          <Chip
            key={value}
            label={label}
            selected={draft.dueDate === value}
            onPress={() => setDueDate(value)}
            icon={
              value === "all" ? (
                <CalendarDays size={13} color="#7B8799" />
              ) : undefined
            }
          />
        ))}
      </View>
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  resetText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: colors.brand,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 5,
    marginLeft: 3,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: "#7D899C",
  },
  selectedText: { color: colors.brand },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    minHeight: 32,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E5ED",
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    borderColor: "#B9C7FF",
    backgroundColor: "#F1F4FF",
  },
  chipDisabled: { opacity: 0.48 },
  chipText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    color: "#536175",
  },
  memberPicker: {
    marginTop: 7,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E7EF",
    backgroundColor: "#FFFFFF",
  },
  searchRow: {
    height: 36,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F7F8FB",
  },
  searchInput: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    fontSize: 12,
    color: "#253047",
  },
  memberRow: {
    minHeight: 42,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EDF0F4",
  },
  memberName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  applyButton: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  applyText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
