import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  ArrowLeft,
  CircleAlert,
  LockKeyhole,
  Star,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { StarsPath } from "@/components/stars/StarsPath";
import { StarsTeamRoster } from "@/components/stars/StarsTeamRoster";
import {
  memberStarPath,
  memberStars,
  teamMomentumAccessState,
  teamMomentumMemberDetailQueryKey,
  teamMomentumSummaryQueryKey,
  teamStarsRoster,
  type TeamMomentumLeaderSummary,
  type TeamMomentumMemberDetail,
  type TeamMomentumMemberSummary,
} from "@/lib/team-momentum";
import { STARS_GOLD } from "@/lib/stars";
import { AppPageBackground } from "@/components/AppPageBackground";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
} from "@/components/AlenioBottomSheet";
import { isLeaderRole } from "@/lib/member-identity";
import { colors, space } from "@/theme";

function BrandedState({
  kind,
  onRetry,
}: {
  kind: "leader_required" | "plan_required" | "unavailable";
  onRetry: () => void;
}) {
  const content =
    kind === "leader_required"
      ? {
          title: "Leader view",
          body: "The team Stars roster is private to workspace leaders.",
          icon: LockKeyhole,
        }
      : kind === "plan_required"
        ? {
            title: "Unlock Stars",
            body: "Stars is included with an active Alenio Team plan or trial.",
            icon: Star,
          }
        : {
            title: "Stars is unavailable",
            body: "We couldn’t load Stars for this workspace right now.",
            icon: CircleAlert,
          };
  const Icon = content.icon;
  return (
    <View
      style={styles.centerState}
      testID={`team-stars-${kind.replace("_", "-")}-state`}
    >
      <View style={styles.stateIcon}>
        <Icon size={24} color={STARS_GOLD} fill={kind === "plan_required" ? STARS_GOLD : "transparent"} />
      </View>
      <Text style={styles.stateTitle}>{content.title}</Text>
      <Text style={styles.stateBody}>{content.body}</Text>
      {kind === "unavailable" ? (
        <Pressable onPress={onRetry} style={styles.retryButton} testID="team-stars-retry-button">
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function TeamStarsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    teamId?: string;
    memberUserId?: string;
  }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const memberUserId =
    typeof params.memberUserId === "string" ? params.memberUserId : "";
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [mode, setMode] = useState<"team" | "mine">(
    memberUserId ? "mine" : "mine",
  );
  const openedPersonalFallback = useRef(false);
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Array<{ id: string; role?: string }>>("/api/teams"),
    enabled: !!teamId,
  });
  const myRole = teams?.find((team) => team.id === teamId)?.role;
  const canSeeTeam = isLeaderRole(myRole);
  const [selectedMember, setSelectedMember] =
    useState<TeamMomentumMemberSummary | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  const summaryQuery = useQuery({
    queryKey: teamMomentumSummaryQueryKey(teamId),
    queryFn: () =>
      api.get<TeamMomentumLeaderSummary>(`/api/teams/${teamId}/stars`),
    enabled: !!teamId && mode === "team" && canSeeTeam,
  });

  const detailMemberUserId =
    mode === "mine"
      ? currentUserId || memberUserId
      : selectedMember?.userId || "";

  const detailQuery = useQuery({
    queryKey: teamMomentumMemberDetailQueryKey(teamId, detailMemberUserId),
    queryFn: () =>
      api.get<TeamMomentumMemberDetail>(
        `/api/teams/${teamId}/stars/members/${encodeURIComponent(detailMemberUserId)}?currentRunLimit=50`,
      ),
    enabled: !!teamId && !!detailMemberUserId,
  });

  const accessState = teamMomentumAccessState(summaryQuery.error);
  const personalAccessState = teamMomentumAccessState(detailQuery.error);
  const roster = useMemo(
    () => (summaryQuery.data ? teamStarsRoster(summaryQuery.data) : []),
    [summaryQuery.data],
  );

  const mineErrorCode =
    detailQuery.error &&
    typeof detailQuery.error === "object" &&
    "body" in detailQuery.error
      ? (detailQuery.error as { body?: { error?: { code?: string } } }).body
          ?.error?.code
      : undefined;
  const ownerExcluded = mode === "mine" && mineErrorCode === "MEMBER_NOT_FOUND";

  useEffect(() => {
    if (!canSeeTeam && mode === "team") setMode("mine");
  }, [canSeeTeam, mode]);

  useEffect(() => {
    if (openedPersonalFallback.current || mode !== "team") return;
    if (accessState !== "leader_required") return;
    openedPersonalFallback.current = true;
    setMode("mine");
  }, [accessState, mode]);

  const onRefresh = async () => {
    setIsPullRefreshing(true);
    try {
      if (mode === "team") await summaryQuery.refetch();
      else await detailQuery.refetch();
    } finally {
      setIsPullRefreshing(false);
    }
  };

  const detail = detailQuery.data;
  const path = detail
    ? {
        currentStars: memberStars(detail.member),
        ...memberStarPath(detail.member),
        filledInSegment: detail.filledInSegment,
        segmentSize: detail.segmentSize,
        nextMilestone: detail.nextMilestone,
        remainingToMilestone: detail.remainingToMilestone,
      }
    : null;

  return (
    <AppPageBackground>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top - 8, 0) }]}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(app)/execute");
            }}
            hitSlop={10}
            style={styles.back}
            testID="team-stars-back-button"
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color="#0F172A" strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.title}>Stars</Text>
          <Pressable
            onPress={() => setShowInfo(true)}
            hitSlop={10}
            style={styles.infoHit}
            accessibilityRole="button"
            accessibilityLabel="How Stars works"
          >
            <Text style={styles.infoHitLabel}>Info</Text>
          </Pressable>
        </View>

        {canSeeTeam ? (
          <View style={styles.tabs} accessibilityRole="tablist">
            <Pressable
              onPress={() => setMode("mine")}
              style={[styles.tab, mode === "mine" ? styles.tabActive : null]}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === "mine" }}
              testID="stars-tab-mine"
            >
              <Text
                style={[
                  styles.tabLabel,
                  mode === "mine" ? styles.tabLabelActive : null,
                ]}
              >
                My Stars
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("team")}
              style={[styles.tab, mode === "team" ? styles.tabActive : null]}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === "team" }}
              testID="stars-tab-team"
            >
              <Text
                style={[
                  styles.tabLabel,
                  mode === "team" ? styles.tabLabelActive : null,
                ]}
              >
                Team
              </Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={isPullRefreshing} onRefresh={onRefresh} />
          }
          testID="team-stars-screen"
        >
          {mode === "mine" ? (
            ownerExcluded ? (
              <View style={styles.ownerNote} testID="team-stars-owner-note">
                <Text style={styles.ownerNoteTitle}>Owners aren’t on the star path</Text>
                <Text style={styles.stateBody}>
                  Stars follow members and leaders. Owners are not included in a personal star count.
                </Text>
              </View>
            ) : personalAccessState ? (
              <BrandedState
                kind={personalAccessState}
                onRetry={() => void detailQuery.refetch()}
              />
            ) : detailQuery.isLoading && !detail ? (
              <ActivityIndicator color={STARS_GOLD} style={{ marginTop: 40 }} />
            ) : detail && path ? (
              <View testID="my-stars-page">
                <StarsPath
                  currentStars={path.currentStars}
                  nextMilestone={path.nextMilestone}
                  filledInSegment={path.filledInSegment}
                  segmentSize={path.segmentSize}
                  remainingToMilestone={path.remainingToMilestone}
                />
                <Text style={styles.footerNote}>
                  Assigned workspace tasks fill a star. Private tasks do not.
                </Text>
              </View>
            ) : (
              <View style={styles.centerState}>
                <Text style={styles.stateTitle}>No stars yet</Text>
                <Text style={styles.stateBody}>
                  Complete an assigned workspace task to fill your first star.
                </Text>
              </View>
            )
          ) : accessState ? (
            <BrandedState
              kind={accessState}
              onRetry={() => void summaryQuery.refetch()}
            />
          ) : summaryQuery.isLoading && !summaryQuery.data ? (
            <ActivityIndicator color={STARS_GOLD} style={{ marginTop: 40 }} />
          ) : (
            <View testID="team-stars-summary">
              <Text style={styles.sectionTitle}>Team</Text>
              <Text style={styles.sectionSub}>
                {summaryQuery.data?.needsNudgeCount
                  ? `${summaryQuery.data.needsNudgeCount} need a nudge`
                  : "Who’s filling stars"}
              </Text>
              <StarsTeamRoster
                rows={roster}
                coaching={summaryQuery.data?.coachingVisible !== false}
                onOpenMember={(userId) => {
                  const row = roster.find((item) => item.userId === userId);
                  if (row) setSelectedMember(row);
                }}
              />
            </View>
          )}
        </ScrollView>

        <AlenioBottomSheet
          visible={showInfo}
          title="How Stars works"
          onClose={() => setShowInfo(false)}
          testID="team-stars-info-sheet"
        >
          <AlenioSheetCard>
            <Text style={styles.infoBody}>
              Complete an assigned workspace task and a hollow star fills in. Hit
              milestones at 5, 10, 15, then every 10. Private reminders don’t count.
              Due dates don’t reset your stars — only uncompleting a task can remove one.
            </Text>
          </AlenioSheetCard>
        </AlenioBottomSheet>

        <AlenioBottomSheet
          visible={!!selectedMember}
          title={selectedMember?.name || "Member stars"}
          onClose={() => setSelectedMember(null)}
          testID="team-stars-detail-sheet"
        >
          {selectedMember ? (
            <AlenioSheetCard>
              <StarsPath
                currentStars={memberStars(selectedMember)}
                nextMilestone={selectedMember.nextMilestone}
                remainingToMilestone={selectedMember.remainingToMilestone}
              />
            </AlenioSheetCard>
          ) : null}
        </AlenioBottomSheet>
      </SafeAreaView>
    </AppPageBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: 8,
    gap: 8,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  infoHit: { paddingHorizontal: 8, paddingVertical: 6 },
  infoHitLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand,
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: space.md,
    marginBottom: 8,
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#0F172A",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  tabLabelActive: {
    color: "#FFFFFF",
  },
  scroll: {
    paddingHorizontal: space.md,
    paddingBottom: 40,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionSub: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 8,
  },
  footerNote: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
    color: "#94A3B8",
  },
  centerState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF8E7",
    marginBottom: 4,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  stateBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#0F172A",
  },
  retryLabel: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  ownerNote: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    gap: 6,
  },
  ownerNoteTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  infoBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#334155",
  },
});
