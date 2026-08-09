import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Flag,
  Search,
  User,
} from "lucide-react-native";
import type { TeamMember } from "@/lib/types";
import {
  AlenioBottomSheet,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import type {
  AssignedToFilter,
  DueDateFilter,
  FilterPicker,
  PriorityFilter,
  SortFilter,
  TaskStatusTab,
  WorkspaceFiltersState,
} from "./workspace-types";
import {
  DEFAULT_WORKSPACE_FILTERS,
} from "./workspace-types";
import { taskStatusLabel } from "./workspace-utils";
import { colors } from "@/theme";

type Props = {
  picker: FilterPicker;
  filters: WorkspaceFiltersState;
  members: TeamMember[];
  isLeader: boolean;
  activeCount: number;
  completedCount: number;
  onClose: () => void;
  onApply: (next: WorkspaceFiltersState) => void;
};

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function RadioRow({
  label,
  selected,
  onPress,
  detail,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  detail?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.radioRow}>
      <View style={styles.radioCopy}>
        <Text style={[styles.radioLabel, selected ? styles.selectedText : null]}>
          {label}
        </Text>
        {detail ? <Text style={styles.radioDetail}>{detail}</Text> : null}
      </View>
      <View style={[styles.radio, selected ? styles.radioSelected : null]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
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
      {selected ? <Check size={12} color={colors.brand} strokeWidth={2.5} /> : icon}
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
  activeCount,
  completedCount,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState(filters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const visible = picker === "filterView";

  useEffect(() => {
    if (!visible) return;
    setDraft(filters);
    setAdvancedOpen(false);
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
  const setDueDate = (dueDate: DueDateFilter) =>
    setDraft((current) => ({ ...current, dueDate }));
  const setPriority = (priority: PriorityFilter) =>
    setDraft((current) => ({ ...current, priority }));
  const setSort = (sort: SortFilter) =>
    setDraft((current) => ({ ...current, sort }));
  const setStatus = (statusTab: TaskStatusTab) =>
    setDraft((current) => ({
      ...current,
      statusTab,
      sort:
        statusTab === "completed" || statusTab === "archived"
          ? current.sort === "due"
            ? "newest"
            : current.sort
          : current.sort,
    }));

  const reset = () => {
    setDraft(DEFAULT_WORKSPACE_FILTERS);
    setMemberPickerOpen(false);
    setMemberQuery("");
  };

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Filter & View"
      subtitle="Customize how your task list is displayed."
      onClose={onClose}
      bodyHeightRatio={0.68}
      compact
      showScrollIndicator
      testID="workspace-filter-view-sheet"
      headerRight={
        <Pressable onPress={reset} hitSlop={10} testID="workspace-filters-reset">
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
      }
      footer={
        <>
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
          <Pressable onPress={onClose} style={alenioSheetStyles.cancelButton}>
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </>
      }
    >
      <SectionTitle>VIEW</SectionTitle>
      <View style={styles.card}>
        <RadioRow
          label={`Active Tasks (${activeCount})`}
          selected={draft.statusTab === "active"}
          onPress={() => setStatus("active")}
        />
        <View style={styles.divider} />
        <RadioRow
          label={`Completed Tasks (${completedCount})`}
          selected={draft.statusTab === "completed"}
          onPress={() => setStatus("completed")}
        />
        <View style={styles.divider} />
        <RadioRow
          label="Archived Tasks"
          selected={draft.statusTab === "archived"}
          onPress={() => setStatus("archived")}
        />
        {isLeader ? (
          <>
            <View style={styles.divider} />
            <RadioRow
              label="All Tasks"
              detail="Active and recently completed"
              selected={draft.statusTab === "all"}
              onPress={() => setStatus("all")}
            />
          </>
        ) : null}
      </View>

      <SectionTitle>ASSIGNED TO</SectionTitle>
      <View style={styles.chipRow}>
        <Chip
          label="Assigned to Me"
          selected={draft.assignedTo === "me"}
          onPress={() => {
            setAssignedTo("me");
            setMemberPickerOpen(false);
          }}
          icon={<User size={13} color="#7B8799" />}
        />
        <Chip
          label="Anyone"
          selected={draft.assignedTo === "entire_team"}
          onPress={() => {
            setAssignedTo("entire_team");
            setMemberPickerOpen(false);
          }}
          disabled={!isLeader}
        />
        <Chip
          label="Specific Person…"
          selected={typeof draft.assignedTo === "object"}
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
                  backgroundColor="#EEF2FF"
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
        <Chip
          label="Custom Range… · Soon"
          selected={draft.dueDate === "calendar_day"}
          onPress={() => {}}
          disabled
        />
      </View>

      <SectionTitle>PRIORITY</SectionTitle>
      <View style={styles.chipRow}>
        {(
          [
            ["all", "Any"],
            ["high", "High"],
            ["medium", "Medium"],
            ["low", "Low"],
          ] as const
        ).map(([value, label]) => (
          <Chip
            key={value}
            label={label}
            selected={draft.priority === value}
            onPress={() => setPriority(value)}
            icon={value === "all" ? <Flag size={13} color="#7B8799" /> : undefined}
          />
        ))}
      </View>

      <SectionTitle>SORT</SectionTitle>
      <View style={styles.card}>
        {(
          [
            ["due", "Due Date"],
            ["priority", "Priority"],
            ["newest", "Newest"],
            ["oldest", "Oldest"],
            ["alphabetical", "Alphabetical"],
          ] as const
        ).map(([value, label], index) => (
          <View key={value}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <RadioRow
              label={label}
              selected={draft.sort === value}
              onPress={() => setSort(value)}
            />
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => setAdvancedOpen((open) => !open)}
        style={styles.advancedHeader}
      >
        <View>
          <Text style={styles.advancedTitle}>Advanced Filters</Text>
          <Text style={styles.advancedSubtitle}>Optional task attributes</Text>
        </View>
        {advancedOpen ? (
          <ChevronUp size={17} color="#758197" />
        ) : (
          <ChevronDown size={17} color="#758197" />
        )}
      </Pressable>
      {advancedOpen ? (
        <View style={styles.card}>
          {["Labels", "Status", "Created By", "Tags", "Custom Fields"].map(
            (label, index) => (
              <View key={label}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.futureRow}>
                  <Circle size={7} color="#9AA5B5" fill="#9AA5B5" />
                  <Text style={styles.futureLabel}>{label}</Text>
                  <Text style={styles.futureValue}>All</Text>
                </View>
              </View>
            ),
          )}
        </View>
      ) : null}
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
  card: {
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4E9F0",
    backgroundColor: "#FFFFFF",
    shadowColor: "#172033",
    shadowOpacity: 0.025,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  radioRow: {
    minHeight: 39,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  radioCopy: { flex: 1, minWidth: 0 },
  radioLabel: {
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "600",
    color: "#253047",
  },
  radioDetail: {
    marginTop: 1,
    fontSize: 8.5,
    lineHeight: 10,
    color: "#8A96A8",
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#CBD3DF",
  },
  radioSelected: { borderColor: colors.brand },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
    backgroundColor: "#EDF0F4",
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
  advancedHeader: {
    minHeight: 48,
    marginTop: 13,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    backgroundColor: "#F7F8FB",
  },
  advancedTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#344055",
  },
  advancedSubtitle: {
    marginTop: 2,
    fontSize: 9.5,
    lineHeight: 12,
    color: "#8A96A8",
  },
  futureRow: {
    minHeight: 38,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  futureLabel: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "600",
    color: "#536175",
  },
  futureValue: {
    fontSize: 10.5,
    color: "#9AA5B5",
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
