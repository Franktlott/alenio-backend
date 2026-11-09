import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock3,
  Search,
  Settings,
  Target,
  X,
} from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import type { CalendarEvent, TeamMember } from "@/lib/types";
import type { NeedsAttentionItem } from "@/lib/coaching-priorities";
import {
  oneOnOneMember,
  oneOnOneStatus,
  type GoalCoverageItem,
} from "@/lib/workspace-snapshot-details";
import {
  SnapshotMetricCard,
  useReduceMotion,
} from "@/components/workspace/snapshot/SnapshotMetricCard";
import type { SnapshotPage } from "@/components/workspace/snapshot/snapshot-types";
import { bindSnapshotPageActions } from "@/lib/workspace-snapshot-pages";

type AttentionProps = {
  visible: boolean;
  items: NeedsAttentionItem[];
  loading: boolean;
  onClose: () => void;
  onMemberPress: (member: TeamMember) => void;
};

export function SnapshotAttentionSheet({
  visible,
  items,
  loading,
  onClose,
  onMemberPress,
}: AttentionProps) {
  return (
    <AlenioBottomSheet
      visible={visible}
      title="Need Attention"
      subtitle={loading ? "Loading team status…" : `${items.length} ${items.length === 1 ? "member needs" : "members need"} follow-up`}
      onClose={onClose}
      compact
      showCloseButton
      showScrollIndicator={items.length > 5}
      testID="snapshot-attention-sheet"
    >
      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }} testID="snapshot-attention-loading">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : items.length === 0 ? (
        <AlenioSheetCard tint="slate" compact>
          <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center" }}>
            Everyone is caught up.
          </Text>
        </AlenioSheetCard>
      ) : (
        <View testID="snapshot-attention-list">
          {items.map((item, index) => (
            <Pressable
              key={item.member.userId}
              onPress={() => onMemberPress(item.member)}
              accessibilityRole="button"
              accessibilityLabel={`${item.member.user.name}, ${item.reason}`}
              testID={`snapshot-attention-member-${item.member.userId}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 10,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: "#EEF2F6",
              }}
            >
              <UserAvatar user={item.member.user} size={34} radius={17} resetKey={item.member.userId} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }}>
                  {item.member.user.name?.trim() || item.member.user.email}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <AlertTriangle size={11} color="#DC2626" />
                  <Text numberOfLines={2} style={{ flex: 1, fontSize: 11, lineHeight: 14, color: "#64748B" }}>
                    {item.reason}
                  </Text>
                </View>
              </View>
              <ChevronRight size={15} color="#CBD5E1" />
            </Pressable>
          ))}
        </View>
      )}
    </AlenioBottomSheet>
  );
}

type GoalsProps = {
  visible: boolean;
  items: GoalCoverageItem[];
  loading: boolean;
  goalsRequired: boolean;
  onClose: () => void;
  onMemberPress: (member: TeamMember) => void;
};

export function SnapshotGoalsSheet({
  visible,
  items,
  loading,
  goalsRequired,
  onClose,
  onMemberPress,
}: GoalsProps) {
  const membersMeetingRequirement = items.filter((item) => item.requirementMet).length;
  const subtitle = !goalsRequired
    ? "Goal requirements are turned off"
    : loading
      ? "Loading goal coverage…"
      : `${membersMeetingRequirement} of ${items.length} ${
          items.length === 1 ? "member meets" : "members meet"
        } the requirement`;

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Goal Coverage"
      subtitle={subtitle}
      onClose={onClose}
      compact
      showCloseButton
      showScrollIndicator={items.length > 5}
      testID="snapshot-goals-sheet"
    >
      {!goalsRequired ? (
        <AlenioSheetCard tint="purple" compact>
          <View style={{ alignItems: "center", paddingVertical: 6, gap: 7 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 13,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F0ECFF",
              }}
            >
              <Target size={18} color="#684BFF" strokeWidth={2.2} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#111827" }}>
              No active-goal requirement
            </Text>
            <Text style={{ maxWidth: 280, fontSize: 11.5, lineHeight: 16, color: "#667085", textAlign: "center" }}>
              Enable Development Standards to measure each member against a required number of active goals.
            </Text>
          </View>
        </AlenioSheetCard>
      ) : loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }} testID="snapshot-goals-loading">
          <ActivityIndicator color="#684BFF" />
        </View>
      ) : items.length === 0 ? (
        <AlenioSheetCard tint="slate" compact>
          <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center" }}>
            There are no eligible workspace members yet.
          </Text>
        </AlenioSheetCard>
      ) : (
        <AlenioSheetCard compact>
          <View testID="snapshot-goals-list">
            {items.map((item, index) => {
              const statusText = item.requirementMet
                ? "Requirement met"
                : `${item.missingGoals} ${item.missingGoals === 1 ? "goal" : "goals"} needed`;
              return (
                <Pressable
                  key={item.member.userId}
                  onPress={() => onMemberPress(item.member)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.member.user.name}, ${item.percentage}% goal coverage, ${statusText}`}
                  testID={`snapshot-goals-member-${item.member.userId}`}
                  style={{
                    paddingVertical: 11,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: "#EEF2F6",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <UserAvatar user={item.member.user} size={36} radius={18} resetKey={item.member.userId} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: "800", color: "#111827" }}>
                          {item.member.user.name?.trim() || item.member.user.email}
                        </Text>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: item.requirementMet ? "#15803D" : "#684BFF" }}>
                          {item.percentage}%
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                        <Text style={{ fontSize: 10.5, color: "#667085" }}>
                          {item.activeGoals} of {item.requiredGoals} active goals
                        </Text>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: item.requirementMet ? "#15803D" : "#8A5A00" }}>
                          {statusText}
                        </Text>
                      </View>
                      <View style={{ height: 5, flexDirection: "row", gap: 3, marginTop: 7 }}>
                        {Array.from({ length: item.requiredGoals }, (_, segment) => (
                          <View
                            key={segment}
                            style={{
                              flex: 1,
                              height: "100%",
                              borderRadius: 3,
                              backgroundColor:
                                segment < Math.min(item.activeGoals, item.requiredGoals)
                                  ? item.requirementMet
                                    ? "#16A34A"
                                    : "#684BFF"
                                  : "#E9ECF3",
                            }}
                          />
                        ))}
                      </View>
                    </View>
                    <ChevronRight size={15} color="#CBD5E1" />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </AlenioSheetCard>
      )}
    </AlenioBottomSheet>
  );
}

type DevelopmentProps = {
  visible: boolean;
  checkInItems: NeedsAttentionItem[];
  goalItems: GoalCoverageItem[];
  loading: boolean;
  goalsRequired: boolean;
  onClose: () => void;
  onSettingsPress?: () => void;
  onCheckInMemberPress: (member: TeamMember) => void;
  onGoalMemberPress: (member: TeamMember) => void;
};

export function SnapshotDevelopmentSheet({
  visible,
  checkInItems,
  goalItems,
  loading,
  goalsRequired,
  onClose,
  onSettingsPress,
  onCheckInMemberPress,
  onGoalMemberPress,
}: DevelopmentProps) {
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<"attention" | "all">(
    "attention",
  );
  useEffect(() => {
    if (!visible) {
      setSearch("");
      setMemberFilter("attention");
    }
  }, [visible]);
  const goalsNeedingAttention = goalsRequired
    ? goalItems.filter((item) => !item.requirementMet)
    : [];
  const checkInsByMember = new Map(
    checkInItems.map((item) => [item.member.userId, item]),
  );
  const goalsByMember = new Map(
    goalsNeedingAttention.map((item) => [item.member.userId, item]),
  );
  const attentionRows = Array.from(
    new Set([...checkInsByMember.keys(), ...goalsByMember.keys()]),
  )
    .map((userId) => {
      const checkIn = checkInsByMember.get(userId);
      const goal = goalsByMember.get(userId);
      return {
        member: checkIn?.member ?? goal!.member,
        checkIn,
        goal,
      };
    })
    .sort((a, b) =>
      (a.member.user.name?.trim() || a.member.user.email).localeCompare(
        b.member.user.name?.trim() || b.member.user.email,
        undefined,
        { sensitivity: "base" },
      ),
    );
  const allGoalsByMember = new Map(
    goalItems.map((item) => [item.member.userId, item]),
  );
  const allRows = Array.from(
    new Set([...allGoalsByMember.keys(), ...checkInsByMember.keys()]),
  )
    .map((userId) => {
      const checkIn = checkInsByMember.get(userId);
      const goal = allGoalsByMember.get(userId);
      return {
        member: checkIn?.member ?? goal!.member,
        checkIn,
        goal,
      };
    })
    .sort((a, b) =>
      (a.member.user.name?.trim() || a.member.user.email).localeCompare(
        b.member.user.name?.trim() || b.member.user.email,
        undefined,
        { sensitivity: "base" },
      ),
    );
  const total = attentionRows.length;
  const visibleRows =
    memberFilter === "attention" ? attentionRows : allRows;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredDevelopmentRows = normalizedSearch
    ? visibleRows.filter((row) =>
        [row.member.user.name, row.member.user.email].some((value) =>
          value?.toLowerCase().includes(normalizedSearch),
        ),
      )
    : visibleRows;

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Development Needs Attention"
      subtitle={
        loading
          ? "Loading development status…"
          : `${total} need attention · ${allRows.length} ${
              allRows.length === 1 ? "member" : "members"
            }`
      }
      onClose={onClose}
      compact
      showCloseButton
      headerRight={
        onSettingsPress ? (
          <Pressable
            onPress={onSettingsPress}
            hitSlop={10}
            style={{
              width: 32,
              height: 32,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#F1F5F9",
            }}
            accessibilityRole="button"
            accessibilityLabel="Development settings"
            testID="snapshot-development-settings"
          >
            <Settings size={16} color="#64748B" strokeWidth={2.1} />
          </Pressable>
        ) : undefined
      }
      showScrollIndicator={false}
      testID="snapshot-development-sheet"
    >
      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator color="#5B45FF" />
        </View>
      ) : allRows.length === 0 ? (
        <AlenioSheetCard tint="slate" compact>
          <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center" }}>
            There are no eligible workspace members yet.
          </Text>
        </AlenioSheetCard>
      ) : (
        <View>
          <View
            style={{
              height: 38,
              marginBottom: 7,
              padding: 3,
              flexDirection: "row",
              gap: 4,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E7EAF0",
              backgroundColor: "#F3F5F8",
            }}
            testID="snapshot-development-filter"
          >
            {(
              [
                ["attention", "Needs attention", total],
                ["all", "All members", allRows.length],
              ] as const
            ).map(([value, label, count]) => {
              const selected = memberFilter === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setMemberFilter(value)}
                  style={{
                    flex: 1,
                    borderRadius: 9,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: selected ? "#FFFFFF" : "transparent",
                    borderWidth: 1,
                    borderColor: selected ? "#D9D3FF" : "transparent",
                    shadowColor: selected ? "#3730A3" : "transparent",
                    shadowOpacity: selected ? 0.08 : 0,
                    shadowRadius: 5,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: selected ? 1 : 0,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`snapshot-development-filter-${value}`}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: selected ? "700" : "600",
                      color: selected ? "#5545D9" : "#69758B",
                    }}
                  >
                    {label}
                  </Text>
                  <View
                    style={{
                      minWidth: 17,
                      height: 17,
                      paddingHorizontal: 4,
                      borderRadius: 9,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? "#684BFF" : "#E4E7ED",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "800",
                        color: selected ? "#FFFFFF" : "#7C8799",
                      }}
                    >
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View
            style={{
              height: 34,
              marginBottom: 7,
              paddingHorizontal: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              backgroundColor: "#F8FAFC",
            }}
          >
            <Search size={14} color="#94A3B8" strokeWidth={2.1} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search members"
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, paddingVertical: 7, fontSize: 12, color: "#0F172A" }}
              testID="snapshot-development-search"
            />
            {search ? (
              <Pressable
                onPress={() => setSearch("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear member search"
              >
                <X size={14} color="#94A3B8" strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>
          {filteredDevelopmentRows.length === 0 ? (
            <AlenioSheetCard tint="slate" compact>
              <Text style={{ paddingVertical: 8, fontSize: 11, color: "#64748B", textAlign: "center" }}>
                {normalizedSearch
                  ? "No members found."
                  : "Everyone is caught up on check-ins and goals."}
              </Text>
            </AlenioSheetCard>
          ) : (
          <ScrollView
            style={{ maxHeight: 294 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={filteredDevelopmentRows.length > 6}
            indicatorStyle="black"
          >
            <AlenioSheetCard
              compact
              style={{
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#E8ECF5",
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2,
                gap: 0,
              }}
            >
              {filteredDevelopmentRows.map((row, index) => (
              <Pressable
                key={row.member.userId}
                onPress={() =>
                  row.checkIn
                    ? onCheckInMemberPress(row.member)
                    : onGoalMemberPress(row.member)
                }
                style={{
                  minHeight: 48,
                  paddingVertical: 5,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: "#EEF2F6",
                }}
                accessibilityRole="button"
                testID={`snapshot-development-member-${row.member.userId}`}
              >
                <UserAvatar
                  user={row.member.user}
                  size={32}
                  radius={16}
                  resetKey={row.member.userId}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: "700", color: "#0F172A" }}>
                    {row.member.user.name?.trim() || row.member.user.email}
                  </Text>
                  <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center", gap: 4 }}>
                    {row.checkIn ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0, flexShrink: 1 }}>
                        <CalendarDays size={11} color="#F97316" strokeWidth={2.1} />
                        <Text numberOfLines={1} style={{ fontSize: 10.5, color: "#475569" }}>
                          {row.checkIn.reason}
                        </Text>
                      </View>
                    ) : null}
                    {row.checkIn && row.goal ? (
                      <View style={{ width: 1, height: 13, marginHorizontal: 2, backgroundColor: "#E2E8F0" }} />
                    ) : null}
                    {row.goal ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0, flexShrink: 1 }}>
                        <Target size={11} color="#7C3AED" strokeWidth={2.1} />
                        <Text numberOfLines={1} style={{ fontSize: 10.5, color: "#475569" }}>
                          {row.goal.requirementMet
                            ? "Goals on track"
                            : `${row.goal.missingGoals} ${
                                row.goal.missingGoals === 1 ? "goal" : "goals"
                              } needed`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <ChevronRight size={15} color="#CBD5E1" />
              </Pressable>
              ))}
            </AlenioSheetCard>
          </ScrollView>
          )}
        </View>
      )}
    </AlenioBottomSheet>
  );
}

type ScheduledProps = {
  visible: boolean;
  events: CalendarEvent[];
  members: TeamMember[];
  loading?: boolean;
  canSchedule: boolean;
  onClose: () => void;
  onEventPress: (event: CalendarEvent) => void;
  onSchedule: () => void;
};

function eventTime(event: CalendarEvent): string {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : null;
  const startLabel = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!end) return startLabel;
  return `${startLabel}–${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function SnapshotScheduledSheet({
  visible,
  events,
  members,
  loading = false,
  canSchedule,
  onClose,
  onEventPress,
  onSchedule,
}: ScheduledProps) {
  return (
    <AlenioBottomSheet
      visible={visible}
      title="Check-Ins Today"
      subtitle={loading ? "Loading today’s check-ins…" : `${events.length} ${events.length === 1 ? "check-in" : "check-ins"} today`}
      onClose={onClose}
      compact
      showCloseButton
      showScrollIndicator={events.length > 5}
      testID="snapshot-scheduled-sheet"
      footer={
        !loading && events.length === 0 && canSchedule ? (
          <Pressable
            onPress={onSchedule}
            style={alenioSheetStyles.primaryButton}
            accessibilityRole="button"
            testID="snapshot-schedule-check-in"
          >
            <Text style={alenioSheetStyles.primaryButtonText}>Schedule a check-in</Text>
          </Pressable>
        ) : undefined
      }
    >
      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }} testID="snapshot-scheduled-loading">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : events.length === 0 ? (
        <AlenioSheetCard tint="slate" compact>
          <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center" }}>
            No one-on-one check-ins are scheduled today.
          </Text>
        </AlenioSheetCard>
      ) : (
        <AlenioSheetCard compact>
          <View testID="snapshot-scheduled-list">
            {events.map((event, index) => {
              const member = oneOnOneMember(event, members);
              const status = oneOnOneStatus(event);
              const memberName = member?.user.name?.trim() || member?.user.email || event.title;
              const statusColor =
                status === "In progress" ? "#15803D" : status === "Completed" ? "#64748B" : "#684BFF";
              const statusBackground =
                status === "In progress" ? "#DCFCE7" : status === "Completed" ? "#F1F5F9" : "#F0ECFF";
              return (
                <Pressable
                  key={event.id}
                  onPress={() => onEventPress(event)}
                  accessibilityRole="button"
                  accessibilityLabel={`${memberName}, ${eventTime(event)}, ${status}`}
                  testID={`snapshot-check-in-${event.id}`}
                  style={{
                    paddingVertical: 7,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: "#EEF2F6",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {member ? (
                      <UserAvatar user={member.user} size={30} radius={15} resetKey={member.userId} />
                    ) : (
                      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                        <Clock3 size={14} color="#2563EB" />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 11.5, fontWeight: "800", color: "#111827" }}>
                          {memberName}
                        </Text>
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            backgroundColor: statusBackground,
                          }}
                        >
                          <Text style={{ fontSize: 8, fontWeight: "800", color: statusColor }}>
                            {status}
                          </Text>
                        </View>
                      </View>
                      <Text numberOfLines={1} style={{ fontSize: 9, color: "#667085", marginTop: 1 }}>
                        {eventTime(event)} · {event.title}
                      </Text>
                    </View>
                    <ChevronRight size={15} color="#CBD5E1" />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </AlenioSheetCard>
      )}
      {!loading && events.length === 0 && !canSchedule ? (
        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5 }}>
          <CalendarPlus size={12} color="#94A3B8" />
          <Text style={{ fontSize: 10, color: "#94A3B8" }}>A leader can schedule the next check-in.</Text>
        </View>
      ) : null}
    </AlenioBottomSheet>
  );
}

type PulseSheetProps = {
  visible: boolean;
  workspaceName?: string | null;
  pages: SnapshotPage[];
  loading?: boolean;
  onClose: () => void;
};

function pulseMetricRows(page: SnapshotPage | undefined) {
  const metrics = page?.metrics ?? [];
  const rows: (typeof metrics)[] = [];
  for (let i = 0; i < metrics.length; i += 2) {
    rows.push(metrics.slice(i, i + 2));
  }
  return rows;
}

export function WorkspacePulseSheet({
  visible,
  workspaceName,
  pages,
  loading = false,
  onClose,
}: PulseSheetProps) {
  const reduceMotion = useReduceMotion();
  const pulsePages = useMemo(
    () =>
      bindSnapshotPageActions(pages, (action) => {
        if (!action) return undefined;
        return () => {
          onClose();
          setTimeout(action, 80);
        };
      }),
    [onClose, pages],
  );
  const pulsePage =
    pulsePages.find((page) => page.key !== "alenio-go") ?? pulsePages[0];
  const rows = pulseMetricRows(pulsePage);

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Workplace Pulse"
      subtitle={workspaceName?.trim() || undefined}
      onClose={onClose}
      compact
      scrollEnabled={false}
      testID="workspace-pulse-sheet"
    >
      {rows.length === 0 ? (
        <Text style={pulseStyles.empty}>
          Pulse will appear once this workspace is ready.
        </Text>
      ) : (
        <View style={pulseStyles.grid}>
          {rows.map((row) => (
            <View
              key={row.map((metric) => metric.key).join("-")}
              style={pulseStyles.row}
            >
              {row.map((metric) => (
                <View key={metric.key} style={pulseStyles.tile}>
                  <SnapshotMetricCard
                    metric={metric}
                    variant="tile"
                    reduceMotion={reduceMotion}
                    loading={loading}
                  />
                </View>
              ))}
              {row.length === 1 ? <View style={pulseStyles.tile} /> : null}
            </View>
          ))}
        </View>
      )}
    </AlenioBottomSheet>
  );
}

const pulseStyles = StyleSheet.create({
  grid: {
    gap: 10,
    paddingTop: 6,
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  tile: {
    flex: 1,
    minWidth: 0,
  },
  empty: {
    paddingVertical: 18,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
});
