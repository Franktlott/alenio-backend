import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CalendarClock, ChevronRight, Search, X } from "lucide-react-native";
import { router } from "expo-router";
import type { TeamMember } from "@/lib/types";
import type { MemberStatsPayload } from "@/lib/workplace-standards";
import {
  coachingFilterSubtitle,
  coachingFilterTitle,
  filterMembersByCoachingFilter,
  type CoachingPriorityFilter,
} from "@/lib/coaching-priorities";
import { planOneOnOneHref } from "@/lib/plan-one-on-one";
import { isLeaderRole, memberMatchesUserId } from "@/lib/member-identity";
import { MissedCheckInRow } from "@/components/people/MissedCheckInRow";
import { GoalsDueRow } from "@/components/people/GoalsDueRow";
import { TeamMemberRow } from "@/components/TeamMemberRow";
import { formatDaysSinceCheckIn } from "@/lib/member-stats-display";
import {
  AlenioBottomSheet,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { colors } from "@/theme";

type Props = {
  visible: boolean;
  filter: CoachingPriorityFilter | null;
  teamId: string;
  members: TeamMember[];
  memberStats?: MemberStatsPayload["stats"];
  checkInRequired: boolean;
  goalsRequired: boolean;
  myId: string;
  myEmail: string;
  myRole?: string | null;
  onClose: () => void;
};

export function CoachingPrioritySheet({
  visible,
  filter,
  teamId,
  members,
  memberStats,
  checkInRequired,
  goalsRequired,
  myId,
  myEmail,
  myRole,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const activeFilter = filter ?? "checkInDue";

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible, filter]);

  const filtered = useMemo(
    () =>
      filter
        ? filterMembersByCoachingFilter({
            members,
            memberStats,
            filter,
            standards: { checkInRequired, goalsRequired },
          })
        : [],
    [checkInRequired, filter, goalsRequired, memberStats, members],
  );

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((member) => {
      const name = member.user.name?.toLowerCase() ?? "";
      const email = member.user.email?.toLowerCase() ?? "";
      return name.includes(q) || email.includes(q);
    });
  }, [filtered, query]);

  const title = coachingFilterTitle(activeFilter, filtered.length);
  const subtitle = coachingFilterSubtitle(activeFilter);
  const isCheckIn = activeFilter === "checkInDue";
  const isGoals = activeFilter === "goalsMissing";

  const canViewMemberProfile = (targetUserId: string, targetRole: string) => {
    if (!myId || targetUserId === myId) return true;
    if (targetRole === "owner") return false;
    return isLeaderRole(myRole);
  };

  const openProfile = (userId: string) => {
    onClose();
    router.push({
      pathname: "/member-profile",
      params: { teamId, memberUserId: userId },
    });
  };

  return (
    <AlenioBottomSheet
      visible={visible && !!filter}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      showCloseButton
      bodyHeightRatio={0.68}
      showScrollIndicator
      testID="coaching-priority-sheet"
      footer={
        isCheckIn && filtered.length > 0 ? (
          <Pressable
            onPress={() => {
              const firstMemberId =
                visibleMembers.length === 1
                  ? visibleMembers[0]?.userId
                  : filtered.length === 1
                    ? filtered[0]?.userId
                    : undefined;
              onClose();
              router.push(
                planOneOnOneHref(teamId, {
                  memberUserId: firstMemberId,
                  myRole: typeof myRole === "string" ? myRole : undefined,
                }),
              );
            }}
            style={styles.footerBtn}
            testID="coaching-priority-schedule-check-in"
          >
            <CalendarClock size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.footerBtnText}>Schedule check-in</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onClose}
            style={alenioSheetStyles.cancelButton}
            testID="coaching-priority-sheet-close"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Close</Text>
          </Pressable>
        )
      }
    >
      {filtered.length > 0 ? (
        <View style={styles.searchWrap}>
          <Search size={15} color="#94A3B8" strokeWidth={2.25} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
            testID="coaching-priority-search"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              hitSlop={8}
              testID="coaching-priority-search-clear"
            >
              <X size={14} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>All clear</Text>
          <Text style={styles.emptySub}>Nobody matches this priority right now.</Text>
        </View>
      ) : visibleMembers.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptySub}>Try a different name.</Text>
        </View>
      ) : isCheckIn ? (
        <View style={styles.list}>
          {visibleMembers.map((item, index) => {
            const stats = memberStats?.[item.userId];
            const compliance = stats?.standardsCompliance;
            const hasProfilePermission = canViewMemberProfile(item.userId, item.role);
            return (
              <MissedCheckInRow
                key={item.id}
                name={item.user.name ?? "Member"}
                role={item.role}
                image={item.user.image}
                isCurrentUser={memberMatchesUserId(item, myId, myEmail)}
                daysSinceLastCheckIn={stats?.daysSinceLastOneOnOne}
                checkInStatus={compliance?.checkInStatus}
                showLastCheckIn={
                  checkInRequired && stats?.daysSinceLastOneOnOne != null
                }
                showDivider={index < visibleMembers.length - 1}
                onPress={
                  hasProfilePermission ? () => openProfile(item.userId) : undefined
                }
                testID={`coaching-sheet-member-${item.userId}`}
              />
            );
          })}
        </View>
      ) : isGoals ? (
        <View style={styles.list}>
          {visibleMembers.map((item, index) => {
            const stats = memberStats?.[item.userId];
            const compliance = stats?.standardsCompliance;
            const hasProfilePermission = canViewMemberProfile(item.userId, item.role);
            return (
              <GoalsDueRow
                key={item.id}
                name={item.user.name ?? "Member"}
                role={item.role}
                image={item.user.image}
                isCurrentUser={memberMatchesUserId(item, myId, myEmail)}
                goalsValue={compliance?.goalsDisplay ?? "—"}
                missingGoals={compliance?.missingGoals ?? 0}
                showDivider={index < visibleMembers.length - 1}
                onPress={
                  hasProfilePermission ? () => openProfile(item.userId) : undefined
                }
                testID={`coaching-sheet-member-${item.userId}`}
              />
            );
          })}
        </View>
      ) : (
        <View style={styles.list}>
          {visibleMembers.map((item, index) => {
            const stats = memberStats?.[item.userId];
            const compliance = stats?.standardsCompliance;
            const hasProfilePermission = canViewMemberProfile(item.userId, item.role);
            return (
              <TeamMemberRow
                key={item.id}
                name={item.user.name ?? "Member"}
                role={item.role}
                image={item.user.image}
                isCurrentUser={memberMatchesUserId(item, myId, myEmail)}
                showMetrics
                hasProfilePermission={hasProfilePermission}
                checkInValue={formatDaysSinceCheckIn(stats?.daysSinceLastOneOnOne)}
                goalsValue={compliance?.goalsDisplay ?? "—"}
                completedTasks={stats?.completedTasks ?? 0}
                activeTasks={stats?.activeTasks ?? 0}
                overdueTasks={stats?.overdueTasks ?? 0}
                checkInStatus={compliance?.checkInStatus}
                goalsStatus={compliance?.goalsStatus}
                showCheckInMetric={false}
                showGoalsMetric={false}
                showDivider={index < visibleMembers.length - 1}
                onPress={
                  hasProfilePermission ? () => openProfile(item.userId) : undefined
                }
                testID={`coaching-sheet-member-${item.userId}`}
              />
            );
          })}
          {activeFilter === "overdueTasks" ? (
            <Pressable
              onPress={() => {
                onClose();
                router.push("/(app)/execute");
              }}
              style={styles.secondaryLink}
              testID="coaching-sheet-open-workspace"
            >
              <Text style={styles.secondaryLinkText}>Open Workspace</Text>
              <ChevronRight size={14} color={colors.brand} />
            </Pressable>
          ) : null}
        </View>
      )}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "500",
    color: "#0F172A",
    paddingVertical: 0,
  },
  list: {
    marginHorizontal: -4,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#F1F5F9",
  },
  empty: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptySub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: "#8B95A5",
    textAlign: "center",
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
  },
  footerBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#F8FAFC",
  },
  secondaryLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand,
  },
});
