import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CircleAlert,
  LockKeyhole,
  Star,
  Users,
  X,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { StarsHeroCard } from "@/components/stars/StarsHeroCard";
import { StarsJourneyList } from "@/components/stars/StarsJourneyList";
import { StarsNextMilestoneRow } from "@/components/stars/StarsNextMilestoneRow";
import { StarsTeamHeroCard } from "@/components/stars/StarsTeamHeroCard";
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
import {
  buildStarsJourney,
  STARS_GOLD,
  starsJourneyTitle,
  starsMilestoneSegment,
} from "@/lib/stars";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
} from "@/components/AlenioBottomSheet";
import { SegmentedControl } from "@/components/ui";
import { WS } from "@/components/workspace/workspace-ui";
import {
  CONTENT_MAX_WIDTH,
  useAdaptiveLayout,
  useStatusClusterInset,
} from "@/lib/adaptive-layout";
import { isLeaderRole } from "@/lib/member-identity";
import { colors, typography } from "@/theme";

async function fetchStarsSummary(teamId: string) {
  try {
    return await api.get<TeamMomentumLeaderSummary>(
      `/api/teams/${teamId}/stars`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return api.get<TeamMomentumLeaderSummary>(
        `/api/teams/${teamId}/momentum`,
      );
    }
    throw error;
  }
}

async function fetchStarsMemberDetail(teamId: string, memberUserId: string) {
  const path = `/api/teams/${teamId}/stars/members/${encodeURIComponent(memberUserId)}?currentRunLimit=50`;
  try {
    return await api.get<TeamMomentumMemberDetail>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return api.get<TeamMomentumMemberDetail>(
        `/api/teams/${teamId}/momentum/members/${encodeURIComponent(memberUserId)}?currentRunLimit=50`,
      );
    }
    throw error;
  }
}

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
  const params = useLocalSearchParams<{
    teamId?: string;
    memberUserId?: string;
  }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const memberUserId =
    typeof params.memberUserId === "string" ? params.memberUserId : "";
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [mode, setMode] = useState<"team" | "mine">("mine");
  const openedPersonalFallback = useRef(false);
  const defaultedLeaderTab = useRef(false);
  const { data: teams, isLoading: teamsLoading } = useQuery({
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
  const scrollRef = useRef<ScrollView>(null);
  const journeyActiveY = useRef(0);
  const { columnWidth } = useAdaptiveLayout();
  const statusCluster = useStatusClusterInset();
  const columnPad = {
    alignSelf: "center" as const,
    width: "100%" as const,
    maxWidth: Math.min(columnWidth, CONTENT_MAX_WIDTH),
    paddingLeft: WS.pageGutter + statusCluster.left,
    paddingRight: WS.pageGutter + statusCluster.right,
  };

  const summaryQuery = useQuery({
    queryKey: teamMomentumSummaryQueryKey(teamId),
    queryFn: () => fetchStarsSummary(teamId),
    enabled: !!teamId && mode === "team" && canSeeTeam,
  });

  const detailMemberUserId =
    mode === "mine"
      ? currentUserId || memberUserId
      : selectedMember?.userId || "";

  const detailQuery = useQuery({
    queryKey: teamMomentumMemberDetailQueryKey(teamId, detailMemberUserId),
    queryFn: () => fetchStarsMemberDetail(teamId, detailMemberUserId),
    enabled: !!teamId && !!detailMemberUserId,
  });

  const accessState = teamMomentumAccessState(summaryQuery.error);
  const personalAccessState = teamMomentumAccessState(detailQuery.error);
  const roster = useMemo(
    () => (summaryQuery.data ? teamStarsRoster(summaryQuery.data) : []),
    [summaryQuery.data],
  );

  // Leaders land on Team; everyone else stays on My Stars.
  useEffect(() => {
    if (defaultedLeaderTab.current || teamsLoading) return;
    if (!canSeeTeam) return;
    defaultedLeaderTab.current = true;
    if (!memberUserId) setMode("team");
  }, [canSeeTeam, teamsLoading, memberUserId]);

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
        dayStreak: detail.dayStreak ?? 0,
        journey: detail.journey?.length
          ? detail.journey
          : buildStarsJourney(memberStars(detail.member)),
      }
    : null;
  const activeJourney = path?.journey.find((step) => step.status === "active");
  const nextMilestoneTitle = activeJourney
    ? activeJourney.title
    : path
      ? starsJourneyTitle(path.nextMilestone)
      : "Getting Started";

  const closeSheet = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/execute");
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={[styles.header, columnPad]}>
          <Image
            source={require("@/assets/alenio-icon.png")}
            style={styles.brandIcon}
            resizeMode="contain"
            accessibilityLabel="Alenio"
          />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Stars</Text>
          </View>
          <Pressable
            onPress={() => setShowInfo(true)}
            hitSlop={10}
            style={styles.infoHit}
            accessibilityRole="button"
            accessibilityLabel="How Stars works"
          >
            <Text style={styles.infoHitLabel}>Info</Text>
          </Pressable>
          <Pressable
            onPress={closeSheet}
            hitSlop={10}
            style={styles.close}
            testID="team-stars-close-button"
            accessibilityRole="button"
            accessibilityLabel="Close Stars"
          >
            <X size={18} color="#0F172A" strokeWidth={2.3} />
          </Pressable>
        </View>

        {canSeeTeam ? (
          <View style={[styles.tabsWrap, columnPad]}>
            <SegmentedControl
              options={[
                { key: "mine", label: "My Stars", Icon: Star },
                { key: "team", label: "Team", Icon: Users },
              ]}
              value={mode}
              onChange={setMode}
              testID="stars-view-toggle"
              testIDPrefix="stars-tab"
            />
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, styles.scrollAlign]}
          refreshControl={
            <RefreshControl refreshing={isPullRefreshing} onRefresh={onRefresh} />
          }
          testID="team-stars-screen"
        >
          <View style={[styles.scrollColumn, columnPad]}>
          {mode === "mine" ? (
            !detailMemberUserId || (detailQuery.isLoading && !detail) ? (
              <ActivityIndicator color={STARS_GOLD} style={{ marginTop: 40 }} />
            ) : personalAccessState ? (
              <BrandedState
                kind={personalAccessState}
                onRetry={() => void detailQuery.refetch()}
              />
            ) : detailQuery.isError ? (
              <View style={styles.centerState} testID="my-stars-error">
                <Text style={styles.stateTitle}>Couldn’t load your stars</Text>
                <Text style={styles.stateBody}>
                  {detailQuery.error instanceof Error
                    ? detailQuery.error.message
                    : "Something went wrong. Pull to retry."}
                </Text>
                <Pressable
                  onPress={() => void detailQuery.refetch()}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryLabel}>Try again</Text>
                </Pressable>
              </View>
            ) : detail && path ? (
              <View testID="my-stars-page" style={styles.mineStack}>
                <StarsHeroCard
                  currentStars={path.currentStars}
                  dayStreak={path.dayStreak}
                  filledInSegment={path.filledInSegment}
                  segmentSize={path.segmentSize}
                />
                <StarsNextMilestoneRow
                  title={nextMilestoneTitle}
                  remaining={path.remainingToMilestone}
                  onPress={() => {
                    scrollRef.current?.scrollTo({
                      y: Math.max(0, journeyActiveY.current - 24),
                      animated: true,
                    });
                  }}
                />
                <View
                  onLayout={(event) => {
                    journeyActiveY.current = event.nativeEvent.layout.y;
                  }}
                >
                  <StarsJourneyList steps={path.journey} />
                </View>
                <Text style={styles.footerNote}>
                  Assigned workspace tasks fill a star. Private tasks do not.
                </Text>
              </View>
            ) : (
              <View testID="my-stars-page" style={styles.mineStack}>
                <StarsHeroCard currentStars={0} dayStreak={0} />
                <StarsNextMilestoneRow title="Getting Started" remaining={5} />
                <StarsJourneyList steps={buildStarsJourney(0)} />
                <Text style={styles.footerNote}>
                  Assigned workspace tasks fill a star. Private tasks do not.
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
            <View testID="team-stars-summary" style={styles.mineStack}>
              <StarsTeamHeroCard
                activeCount={summaryQuery.data?.activeCount ?? 0}
                eligibleCount={
                  summaryQuery.data?.eligibleCount ?? roster.length
                }
                needsNudgeCount={
                  summaryQuery.data?.needsNudgeCount ??
                  roster.filter((row) => memberStars(row) === 0).length
                }
              />
              <View style={styles.teamHeader}>
                <Text style={styles.journeyHeading}>Team</Text>
                <Text style={styles.sectionSub}>
                  {summaryQuery.data?.needsNudgeCount
                    ? `${summaryQuery.data.needsNudgeCount} need a nudge`
                    : "Who’s filling stars"}
                </Text>
              </View>
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
          </View>
        </ScrollView>

        <AlenioBottomSheet
          visible={showInfo}
          title="How Stars works"
          onClose={() => setShowInfo(false)}
          testID="team-stars-info-sheet"
        >
          <AlenioSheetCard>
            <Text style={styles.infoBody}>
              Complete an assigned workspace task and a hollow star fills in.
              Your journey hits Getting Started (5), Finding Your Rhythm (10),
              Building Momentum (20), and Going Further (50), then continues every
              50. Keep completing on consecutive calendar days to grow your day
              streak — missing a day resets the streak, not your stars. Private
              reminders don’t count. Only uncompleting a task can remove a star.
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
              {(() => {
                const stars = memberStars(selectedMember);
                const segment = starsMilestoneSegment(stars);
                const remaining =
                  selectedMember.remainingToMilestone ??
                  segment.remainingToMilestone;
                const next =
                  selectedMember.nextMilestone ?? segment.nextMilestone;
                return (
                  <View style={styles.memberSheet}>
                    <StarsHeroCard
                      currentStars={stars}
                      dayStreak={0}
                      filledInSegment={segment.filledInSegment}
                      segmentSize={segment.segmentSize}
                    />
                    <StarsNextMilestoneRow
                      title={starsJourneyTitle(next)}
                      remaining={remaining}
                    />
                    <StarsJourneyList steps={buildStarsJourney(stars)} />
                  </View>
                );
              })()}
            </AlenioSheetCard>
          ) : null}
        </AlenioBottomSheet>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  brandIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.pageTitle,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
  },
  infoHit: { paddingHorizontal: 8, paddingVertical: 6 },
  infoHitLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F4F8",
  },
  tabsWrap: {
    marginBottom: 10,
  },
  scroll: {
    paddingBottom: 40,
  },
  scrollAlign: {
    alignItems: "center",
  },
  scrollColumn: {
    gap: 12,
  },
  mineStack: {
    gap: 12,
  },
  memberSheet: {
    gap: 12,
  },
  teamHeader: {
    gap: 2,
  },
  journeyHeading: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionSub: {
    fontSize: 13,
    color: "#64748B",
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
