import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CalendarClock,
  CheckSquare,
  ListFilter,
  Star,
  Target,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { isLeaderRole, memberMatchesUserId } from "@/lib/member-identity";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { isPersistedPaidPlan } from "@/lib/plan-access-copy";
import type { Team } from "@/lib/types";
import {
  mergeWorkplaceStandards,
  type MemberStatsPayload,
} from "@/lib/workplace-standards";
import { formatDaysSinceCheckIn } from "@/lib/member-stats-display";
import { planOneOnOneHref } from "@/lib/plan-one-on-one";
import {
  coachingFilterShortLabel,
  coachingFilterSubtitle,
  coachingFilterTitle,
  filterMembersByCoachingFilter,
  type CoachingPriorityFilter,
} from "@/lib/coaching-priorities";
import { TeamMemberRow } from "@/components/TeamMemberRow";
import { MissedCheckInRow } from "@/components/people/MissedCheckInRow";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { AppPageBackground } from "@/components/AppPageBackground";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { colors, space } from "@/theme";

const FILTERS: CoachingPriorityFilter[] = [
  "checkInDue",
  "goalsMissing",
  "overdueTasks",
  "recognition",
];

function isFilter(value: unknown): value is CoachingPriorityFilter {
  return typeof value === "string" && (FILTERS as string[]).includes(value);
}

function filterOptionIcon(filter: CoachingPriorityFilter) {
  switch (filter) {
    case "checkInDue":
      return <CalendarClock size={16} color="white" />;
    case "goalsMissing":
      return <Target size={16} color="white" />;
    case "overdueTasks":
      return <CheckSquare size={16} color="white" />;
    case "recognition":
      return <Star size={16} color="white" />;
  }
}

export default function TeamPriorityScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const params = useLocalSearchParams<{ teamId?: string; filter?: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const filter: CoachingPriorityFilter = isFilter(params.filter) ? params.filter : "checkInDue";
  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = isPersistedPaidPlan(plan);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const { data: meProfile } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () =>
      api.get<{ id: string; name: string; email: string; image: string | null }>("/api/me"),
    enabled: !!session?.user,
  });

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const { data: memberStatsPayload, isLoading: statsLoading } = useQuery({
    queryKey: ["member-stats", teamId],
    queryFn: () => api.get<MemberStatsPayload>(`/api/teams/${teamId}/tasks/member-stats`),
    enabled: !!teamId && isPaid,
  });

  const myEmail = meProfile?.email || session?.user?.email || "";
  const myId =
    team?.members?.find((m) => memberMatchesUserId(m, meProfile?.id || session?.user?.id || "", myEmail))
      ?.userId ||
    meProfile?.id ||
    session?.user?.id ||
    "";
  const myRole = (team as Team & { role?: string } | undefined)?.role;
  const isOwnerOrLeader = isLeaderRole(myRole);
  const standards = mergeWorkplaceStandards(memberStatsPayload?.workplaceStandards);
  const members = team?.members ?? [];

  const availableFilters = useMemo(() => {
    return FILTERS.filter((item) => {
      if (item === "checkInDue") return standards.checkInRequired;
      if (item === "goalsMissing") return standards.goalsRequired;
      return true;
    });
  }, [standards.checkInRequired, standards.goalsRequired]);

  const filtered = useMemo(
    () =>
      filterMembersByCoachingFilter({
        members,
        memberStats: memberStatsPayload?.stats,
        filter,
        standards: {
          checkInRequired: standards.checkInRequired,
          goalsRequired: standards.goalsRequired,
        },
      }),
    [members, memberStatsPayload?.stats, filter, standards.checkInRequired, standards.goalsRequired],
  );

  const canViewMemberProfile = (targetUserId: string, targetRole: string) => {
    if (!myId || targetUserId === myId) return true;
    if (targetRole === "owner") return false;
    return isLeaderRole(myRole);
  };

  const title = coachingFilterTitle(filter, filtered.length);
  const subtitle = coachingFilterSubtitle(filter);
  const isCheckInFilter = filter === "checkInDue";

  const selectFilter = (next: CoachingPriorityFilter) => {
    setFilterSheetOpen(false);
    if (next === filter) return;
    router.setParams({ filter: next });
  };

  if (!teamId) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <AppPageBackground />
        <Text style={styles.empty}>Missing workspace</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]} testID="team-priority-screen">
      <AppPageBackground />
      <View style={styles.topBar}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/team"))}
          style={styles.sideBtn}
          hitSlop={8}
          testID="team-priority-back"
        >
          <ArrowLeft size={22} color="#0F172A" strokeWidth={2.25} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          onPress={() => setFilterSheetOpen(true)}
          style={styles.sideBtn}
          hitSlop={8}
          testID="team-priority-filter"
        >
          <ListFilter size={20} color="#0F172A" strokeWidth={2.25} />
        </Pressable>
      </View>

      {teamLoading || (isPaid && statsLoading) ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom, 12) + (isCheckInFilter ? 96 : 24),
          }}
          showsVerticalScrollIndicator={false}
        >
          {!isOwnerOrLeader ? (
            <Text style={styles.gate}>Only team leaders can open coaching lists.</Text>
          ) : filtered.length === 0 ? (
            <View style={{ paddingHorizontal: space.pagePad, paddingTop: 8 }}>
              <ProfileCard>
                <View style={{ paddingVertical: 28, alignItems: "center", paddingHorizontal: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>All clear</Text>
                  <Text style={{ marginTop: 4, fontSize: 12, color: "#8B95A5", textAlign: "center" }}>
                    Nobody matches this priority right now.
                  </Text>
                </View>
              </ProfileCard>
            </View>
          ) : isCheckInFilter ? (
            <View style={styles.checkInList}>
              {filtered.map((item, index) => {
                const stats = memberStatsPayload?.stats?.[item.userId];
                const compliance = stats?.standardsCompliance;
                const isCurrentUser = memberMatchesUserId(item, myId, myEmail);
                const hasProfilePermission = canViewMemberProfile(item.userId, item.role);
                return (
                  <MissedCheckInRow
                    key={item.id}
                    name={item.user.name ?? "Member"}
                    role={item.role}
                    image={item.user.image}
                    isCurrentUser={isCurrentUser}
                    daysSinceLastCheckIn={stats?.daysSinceLastOneOnOne}
                    checkInStatus={compliance?.checkInStatus}
                    showLastCheckIn={
                      standards.checkInRequired && stats?.daysSinceLastOneOnOne != null
                    }
                    showDivider={index < filtered.length - 1}
                    onPress={
                      hasProfilePermission
                        ? () =>
                            router.push({
                              pathname: "/member-profile",
                              params: { teamId, memberUserId: item.userId },
                            })
                        : undefined
                    }
                    testID={`priority-member-${item.userId}`}
                  />
                );
              })}
            </View>
          ) : (
            <View style={{ paddingHorizontal: space.pagePad, paddingTop: 4 }}>
              <ProfileCard>
                {filtered.map((item, index) => {
                  const stats = memberStatsPayload?.stats?.[item.userId];
                  const compliance = stats?.standardsCompliance;
                  const isCurrentUser = memberMatchesUserId(item, myId, myEmail);
                  const hasProfilePermission = canViewMemberProfile(item.userId, item.role);
                  return (
                    <TeamMemberRow
                      key={item.id}
                      name={item.user.name ?? "Member"}
                      role={item.role}
                      image={item.user.image}
                      isCurrentUser={isCurrentUser}
                      showMetrics={isPaid}
                      hasProfilePermission={hasProfilePermission}
                      checkInValue={formatDaysSinceCheckIn(stats?.daysSinceLastOneOnOne)}
                      goalsValue={compliance?.goalsDisplay ?? "—"}
                      completedTasks={stats?.completedTasks ?? 0}
                      activeTasks={stats?.activeTasks ?? 0}
                      overdueTasks={stats?.overdueTasks ?? 0}
                      checkInStatus={compliance?.checkInStatus}
                      goalsStatus={compliance?.goalsStatus}
                      showCheckInMetric={standards.checkInRequired}
                      showGoalsMetric={standards.goalsRequired}
                      showDivider={index < filtered.length - 1}
                      onPress={
                        hasProfilePermission
                          ? () =>
                              router.push({
                                pathname: "/member-profile",
                                params: { teamId, memberUserId: item.userId },
                              })
                          : undefined
                      }
                      testID={`priority-member-${item.userId}`}
                    />
                  );
                })}
              </ProfileCard>
            </View>
          )}
        </ScrollView>
      )}

      {isCheckInFilter && filtered.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.footerMeta}>
            {filtered.length} member{filtered.length === 1 ? "" : "s"}
          </Text>
          <Pressable
            onPress={() => {
              const firstMemberId =
                filtered.length === 1 ? filtered[0]?.userId : undefined;
              router.push(
                planOneOnOneHref(teamId, {
                  memberUserId: firstMemberId,
                  myRole: typeof myRole === "string" ? myRole : undefined,
                }),
              );
            }}
            style={styles.footerBtn}
            testID="schedule-check-in"
          >
            <CalendarClock size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.footerBtnText}>Schedule check-in</Text>
          </Pressable>
        </View>
      ) : null}

      <AlenioBottomSheet
        visible={filterSheetOpen}
        title="Priority list"
        subtitle="Choose which coaching list to open"
        onClose={() => setFilterSheetOpen(false)}
        compact
        scrollEnabled={false}
        testID="team-priority-filter-sheet"
        footer={
          <Pressable
            onPress={() => setFilterSheetOpen(false)}
            style={alenioSheetStyles.cancelButton}
            testID="team-priority-filter-cancel"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        }
      >
        {availableFilters.map((item) => (
          <AlenioSheetOption
            key={item}
            icon={filterOptionIcon(item)}
            title={coachingFilterShortLabel(item)}
            subtitle={coachingFilterSubtitle(item)}
            onPress={() => selectFilter(item)}
            testID={`team-priority-filter-${item}`}
          />
        ))}
      </AlenioBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 12,
  },
  sideBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 16,
  },
  checkInList: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#F1F5F9",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { marginTop: 40, textAlign: "center", color: "#64748B" },
  gate: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: space.pagePad,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.pagePad,
    paddingTop: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    gap: 8,
  },
  footerMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
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
});
