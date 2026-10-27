import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Flame,
  LockKeyhole,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { TeamMomentumDashboard } from "@/components/momentum/TeamMomentumDashboard";
import {
  effectiveTeamMomentumBand,
  momentumTaskTitle,
  presentTeamMomentumSummary,
  teamMomentumAccessState,
  teamMomentumMemberDetailQueryKey,
  teamMomentumRoster,
  teamMomentumSummaryQueryKey,
  type TeamMomentumActiveTaskSummary,
  type TeamMomentumCompletionEvidence,
  type TeamMomentumGroupedMember,
  type TeamMomentumLeaderSummary,
  type TeamMomentumMemberDetail,
  type TeamMomentumMemberSummary,
  type TeamMomentumNotEnoughActivityMember,
  type TeamMomentumOverdueTaskSummary,
} from "@/lib/team-momentum";
import { AppPageBackground } from "@/components/AppPageBackground";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
} from "@/components/AlenioBottomSheet";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { UserAvatar } from "@/components/UserAvatar";
import { useAdaptiveLayout } from "@/lib/adaptive-layout";
import { isLeaderRole } from "@/lib/member-identity";
import { colors, space } from "@/theme";

type DisplayMember =
  | TeamMomentumGroupedMember
  | TeamMomentumNotEnoughActivityMember;
type EvidenceTone = "complete" | "late" | "active" | "overdue";
const VISIBLE_EVIDENCE_ROWS = 4;
const EVIDENCE_ROW_HEIGHT = 53;

function memberUser(member: TeamMomentumMemberSummary) {
  return { name: member.name, email: member.email, image: member.image };
}

function formatDate(value: string | null, prefix: string): string {
  if (!value) return `${prefix} date unavailable`;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return `${prefix} date unavailable`;
  return `${prefix} ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
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
          body: "Team Momentum is private to workspace leaders.",
          icon: LockKeyhole,
        }
      : kind === "plan_required"
        ? {
            title: "Unlock Team Momentum",
            body: "Team Momentum is included with an active Alenio Team plan or trial.",
            icon: Flame,
          }
        : {
            title: "Momentum is unavailable",
            body: "We couldn’t load this workspace’s task consistency right now.",
            icon: CircleAlert,
          };
  const Icon = content.icon;
  return (
    <View
      style={styles.centerState}
      testID={`team-momentum-${kind.replace("_", "-")}-state`}
      accessibilityRole="summary"
    >
      <View style={styles.stateIcon}>
        <Icon size={24} color={colors.brand} />
      </View>
      <Text style={styles.stateTitle}>{content.title}</Text>
      <Text style={styles.stateBody}>{content.body}</Text>
      {kind === "unavailable" ? (
        <Pressable
          onPress={onRetry}
          style={styles.retryButton}
          testID="team-momentum-retry-button"
          accessibilityRole="button"
          accessibilityLabel="Try loading Team Momentum again"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function EvidenceRow({
  id,
  title,
  incognito,
  dateCopy,
  tone,
  canOpen,
  onPress,
}: {
  id: string;
  title: string | null;
  incognito: boolean;
  dateCopy: string;
  tone: EvidenceTone;
  canOpen: boolean;
  onPress?: () => void;
}) {
  const color =
    tone === "complete"
      ? "#059669"
      : tone === "late" || tone === "overdue"
        ? "#DC2626"
        : "#5B45FF";
  const Icon =
    tone === "complete"
      ? CheckCircle2
      : tone === "late" || tone === "overdue"
        ? CircleAlert
        : Clock3;
  const displayTitle = momentumTaskTitle({ title, incognito }, canOpen);
  const unavailableCopy = canOpen ? "" : " · Task no longer available";
  return (
    <TouchableOpacity
      disabled={!canOpen}
      onPress={onPress}
      activeOpacity={canOpen ? 0.65 : 1}
      style={styles.evidenceRow}
      testID={`team-momentum-${tone}-row-${id}`}
      accessibilityRole={canOpen ? "button" : "text"}
      accessibilityLabel={`${displayTitle}. ${dateCopy}${unavailableCopy}`}
      accessibilityHint={canOpen ? "Opens task details" : undefined}
    >
      <View style={[styles.evidenceRail, { backgroundColor: color }]} />
      <View style={[styles.evidenceIcon, { backgroundColor: `${color}12` }]}>
        {incognito ? (
          <LockKeyhole size={15} color={color} />
        ) : (
          <Icon size={16} color={color} />
        )}
      </View>
      <View style={styles.evidenceBody}>
        <Text style={styles.evidenceTitle} numberOfLines={1}>
          {displayTitle}
        </Text>
        <Text
          style={[styles.evidenceDate, { color: "#111827" }]}
          numberOfLines={1}
        >
          {dateCopy}
          {!canOpen ? " · Task no longer available" : null}
        </Text>
      </View>
      {canOpen ? <ChevronRight size={17} color="#94A3B8" /> : null}
    </TouchableOpacity>
  );
}

function EvidenceSection({
  title,
  emptyCopy,
  children,
  testID,
}: {
  title: string;
  emptyCopy?: string;
  children?: React.ReactNode;
  testID: string;
}) {
  return (
    <View
      style={styles.taskSection}
      testID={testID}
      accessibilityRole="summary"
    >
      <Text style={styles.taskSectionTitle}>{title}</Text>
      {children ?? <Text style={styles.taskSectionEmpty}>{emptyCopy}</Text>}
    </View>
  );
}

function EvidenceList({
  count,
  children,
  testID,
}: {
  count: number;
  children: React.ReactNode;
  testID: string;
}) {
  const scrollEnabled = count > VISIBLE_EVIDENCE_ROWS;
  return (
    <ScrollView
      style={
        scrollEnabled
          ? { maxHeight: VISIBLE_EVIDENCE_ROWS * EVIDENCE_ROW_HEIGHT }
          : undefined
      }
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled
      directionalLockEnabled
      showsVerticalScrollIndicator={scrollEnabled}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

function PersonalMomentumContent({
  detail,
  detailBand,
  detailStatus,
  onOpenTask,
  onOpenCompletion,
}: {
  detail: TeamMomentumMemberDetail;
  detailBand: ReturnType<typeof effectiveTeamMomentumBand>;
  detailStatus: string;
  onOpenTask: (taskId: string) => void;
  onOpenCompletion: (completion: TeamMomentumCompletionEvidence) => void;
}) {
  return (
    <>
      <ProfileCard>
        <View style={styles.personalSummary}>
          <View style={styles.summaryIcon}>
            <Flame size={22} color="#5B45FF" fill="#5B45FF" />
          </View>
          <View style={styles.detailSummaryBody}>
            <Text style={styles.summaryEyebrow}>YOUR MOMENTUM</Text>
            <Text style={styles.personalSummaryValue}>
              {detail.member.currentStreak}{" "}
              {detailBand === "ready_to_rebuild" ? "earned" : "current"}
            </Text>
            <Text style={styles.detailSummaryCopy}>
              {detailStatus} · {detail.member.personalBestStreak} best task
              streak
            </Text>
          </View>
        </View>
        <View style={styles.personalStats}>
          <View style={styles.personalStat}>
            <Text style={styles.personalStatValue}>
              {detail.member.completedThisMonth}
            </Text>
            <Text style={styles.personalStatLabel}>COMPLETIONS THIS MONTH</Text>
          </View>
          <View style={styles.personalStatDivider} />
          <View style={styles.personalStat}>
            <Text style={styles.personalStatValue}>
              {detail.member.overdueTaskCount}
            </Text>
            <Text style={styles.personalStatLabel}>OVERDUE TASKS</Text>
          </View>
        </View>
      </ProfileCard>

      <View style={styles.contextRow}>
        <CheckCircle2 size={17} color="#64748B" />
        <Text style={styles.contextText}>
          Momentum grows through consecutive assigned tasks completed on time.
        </Text>
      </View>

      <EvidenceSection
        title="CURRENT-RUN COMPLETIONS"
        emptyCopy="Complete an assigned task on time to begin building Momentum."
        testID="my-momentum-current-run"
      >
        {detail.currentRun.completions.length ? (
          <EvidenceList
            count={detail.currentRun.completions.length}
            testID="my-momentum-current-run-list"
          >
            {detail.currentRun.completions.map((completion) => (
              <EvidenceRow
                key={completion.creditId}
                id={completion.creditId}
                title={completion.title}
                incognito={completion.incognito}
                dateCopy={`${formatDate(completion.completedAt, "Completed")} · on time`}
                tone="complete"
                canOpen={completion.sourceTaskAvailable}
                onPress={() => onOpenCompletion(completion)}
              />
            ))}
          </EvidenceList>
        ) : undefined}
      </EvidenceSection>

      <EvidenceSection
        title="OVERDUE TASKS"
        emptyCopy="No overdue tasks."
        testID="my-momentum-overdue-tasks"
      >
        {detail.overdueTasks.length ? (
          <EvidenceList
            count={detail.overdueTasks.length}
            testID="my-momentum-overdue-task-list"
          >
            {detail.overdueTasks.map((task) => (
              <EvidenceRow
                key={task.id}
                id={task.id}
                title={task.title}
                incognito={task.incognito}
                dateCopy={formatDate(task.overdueSince, "Overdue since")}
                tone="overdue"
                canOpen
                onPress={() => onOpenTask(task.id)}
              />
            ))}
          </EvidenceList>
        ) : undefined}
      </EvidenceSection>

      <EvidenceSection
        title="ACTIVE TASKS"
        emptyCopy="No active tasks."
        testID="my-momentum-active-tasks"
      >
        {detail.activeTasks.length ? (
          <EvidenceList
            count={detail.activeTasks.length}
            testID="my-momentum-active-task-list"
          >
            {detail.activeTasks.map((task) => (
              <EvidenceRow
                key={task.id}
                id={task.id}
                title={task.title}
                incognito={task.incognito}
                dateCopy={
                  task.dueAt ? formatDate(task.dueAt, "Due") : "No due date"
                }
                tone="active"
                canOpen
                onPress={() => onOpenTask(task.id)}
              />
            ))}
          </EvidenceList>
        ) : undefined}
      </EvidenceSection>
    </>
  );
}

export default function TeamMomentumScreen() {
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
    memberUserId ? "mine" : "team",
  );
  const openedPersonalFallback = useRef(false);
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Array<{ id: string; role?: string }>>("/api/teams"),
    enabled: !!teamId,
  });
  const myRole = teams?.find((team) => team.id === teamId)?.role;
  const [selectedMember, setSelectedMember] = useState<DisplayMember | null>(
    null,
  );
  const [showMomentumInfo, setShowMomentumInfo] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const adaptive = useAdaptiveLayout();

  const summaryQuery = useQuery({
    queryKey: teamMomentumSummaryQueryKey(teamId),
    queryFn: () =>
      api.get<TeamMomentumLeaderSummary>(`/api/teams/${teamId}/momentum`),
    enabled: !!teamId && mode === "team",
  });
  const detailMemberUserId =
    mode === "mine"
      ? currentUserId || memberUserId
      : selectedMember?.userId || "";
  const detailQuery = useQuery({
    queryKey: teamMomentumMemberDetailQueryKey(teamId, detailMemberUserId),
    queryFn: () =>
      api.get<TeamMomentumMemberDetail>(
        `/api/teams/${teamId}/momentum/members/${encodeURIComponent(detailMemberUserId)}?currentRunLimit=50`,
      ),
    enabled: !!teamId && !!detailMemberUserId,
  });

  const presentation = useMemo(
    () =>
      summaryQuery.data ? presentTeamMomentumSummary(summaryQuery.data) : null,
    [summaryQuery.data],
  );
  const accessState = teamMomentumAccessState(summaryQuery.error);
  const personalAccessState = teamMomentumAccessState(detailQuery.error);
  const roster = useMemo(
    () => (presentation ? teamMomentumRoster(presentation) : []),
    [presentation],
  );
  const dashboardWide = adaptive.width >= 860;
  const mineErrorCode =
    detailQuery.error &&
    typeof detailQuery.error === "object" &&
    "body" in detailQuery.error
      ? (detailQuery.error as { body?: { error?: { code?: string } } }).body
          ?.error?.code
      : undefined;
  const ownerExcluded = mode === "mine" && mineErrorCode === "MEMBER_NOT_FOUND";
  const coachingVisible = summaryQuery.data?.coachingVisible !== false;
  useEffect(() => {
    if (openedPersonalFallback.current || mode !== "team") return;
    if (accessState !== "leader_required" || isLeaderRole(myRole)) return;
    openedPersonalFallback.current = true;
    setMode("mine");
  }, [accessState, mode, myRole]);

  const refresh = async (showIndicator = false) => {
    if (!teamId) return;
    if (showIndicator) setIsPullRefreshing(true);
    try {
      await Promise.all([
        mode === "team" ? summaryQuery.refetch() : Promise.resolve(),
        detailMemberUserId ? detailQuery.refetch() : Promise.resolve(),
      ]);
    } finally {
      if (showIndicator) setIsPullRefreshing(false);
    }
  };
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/(app)/execute");
  const openTask = (taskId: string) => {
    if (!teamId) return;
    setSelectedMember(null);
    router.push({ pathname: "/task-detail", params: { teamId, taskId } });
  };
  const openCompletion = (completion: TeamMomentumCompletionEvidence) => {
    if (completion.sourceTaskAvailable) openTask(completion.sourceTaskId);
  };
  const detail = detailQuery.data;
  const detailBand = detail
    ? effectiveTeamMomentumBand(
        detail.member,
        detail.band,
        detail.generatedAt,
        detail.activeWindowDays,
      )
    : null;
  const detailStatus =
    detailBand === "strong"
      ? "Strong momentum"
      : detailBand === "building"
        ? "Building momentum"
        : detail?.notEnoughActivityReason
          ? "Not enough activity"
          : "Ready to rebuild";

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top"]}
      testID="team-momentum-screen"
    >
      <AppPageBackground />
      <View style={styles.topBar}>
        <Pressable
          onPress={goBack}
          style={styles.sideButton}
          hitSlop={8}
          testID="team-momentum-back-button"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color="#0F172A" strokeWidth={2.25} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Team Momentum</Text>
          <Text style={styles.subtitle}>
            {mode === "mine"
              ? "Your on-time task streak."
              : "See how your team is building consistent progress."}
          </Text>
        </View>
        <View style={styles.sideButton} />
      </View>

      {teamId ? (
        <View style={styles.switchRow}>
          <View style={styles.switch}>
            <Pressable
              onPress={() => {
                setSelectedMember(null);
                setMode("team");
              }}
              style={[styles.switchItem, mode === "team" && styles.switchItemOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "team" }}
            >
              <Text style={mode === "team" ? styles.switchTextOn : styles.switchText}>
                Team
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSelectedMember(null);
                setMode("mine");
              }}
              style={[styles.switchItem, mode === "mine" && styles.switchItemOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "mine" }}
              testID="team-momentum-my-progress"
            >
              <Text style={mode === "mine" ? styles.switchTextOn : styles.switchText}>
                My Progress
              </Text>
            </Pressable>
          </View>
          {mode === "team" ? (
            <View style={styles.monthChip}>
              <CalendarDays size={14} color="#667085" strokeWidth={2.2} />
              <Text style={styles.monthChipText}>This Month</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {!teamId ? (
        <BrandedState kind="unavailable" onRetry={() => void refresh()} />
      ) : mode === "mine" ? (
        detailQuery.isPending ? null : ownerExcluded ? (
          <View style={styles.ownerNote} testID="team-momentum-owner-note">
            <Text style={styles.stateTitle}>No personal run</Text>
            <Text style={styles.stateBody}>
              Team Momentum follows members and leaders. Owners are not included in a personal streak.
            </Text>
          </View>
        ) : personalAccessState ? (
          <BrandedState
            kind={personalAccessState}
            onRetry={() => void refresh()}
          />
        ) : detail ? (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, 16) + 24 },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isPullRefreshing}
                onRefresh={() => void refresh(true)}
                tintColor={colors.brand}
              />
            }
            testID="my-momentum-page"
          >
            <PersonalMomentumContent
              detail={detail}
              detailBand={detailBand!}
              detailStatus={detailStatus}
              onOpenTask={openTask}
              onOpenCompletion={openCompletion}
            />
          </ScrollView>
        ) : (
          <BrandedState kind="unavailable" onRetry={() => void refresh()} />
        )
      ) : summaryQuery.isPending ? null : accessState ? (
        <BrandedState
          kind={accessState ?? "unavailable"}
          onRetry={() => void refresh()}
        />
      ) : summaryQuery.data && presentation ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isPullRefreshing}
              onRefresh={() => void refresh(true)}
              tintColor={colors.brand}
            />
          }
          testID="team-momentum-summary"
        >
          <TeamMomentumDashboard
            summary={summaryQuery.data}
            rows={roster}
            wide={dashboardWide}
            coaching={coachingVisible}
            canOpenMember={(userId) => coachingVisible || userId === currentUserId}
            onOpenInfo={() => setShowMomentumInfo(true)}
            onOpenMember={(userId) => {
              if (!coachingVisible && userId !== currentUserId) return;
              const row = roster.find((item) => item.member.userId === userId);
              if (row) setSelectedMember(row.member);
            }}
          />
        </ScrollView>
      ) : null}

      <AlenioBottomSheet
        visible={showMomentumInfo}
        title="How Momentum works"
        subtitle="What counts toward a task streak"
        onClose={() => setShowMomentumInfo(false)}
        showCloseButton
        bodyHeightRatio={0.58}
        testID="team-momentum-info-sheet"
      >
        <View style={styles.infoContent}>
          <AlenioSheetCard tint="purple" compact>
            <View style={styles.infoRow}>
              <CheckCircle2 size={19} color="#059669" />
              <Text style={styles.infoText}>
                An assigned task with a due date counts when it is completed on
                or before that due date.
              </Text>
            </View>
          </AlenioSheetCard>
          <AlenioSheetCard compact>
            <View style={styles.infoRow}>
              <CheckCircle2 size={19} color={colors.brand} />
              <Text style={styles.infoText}>
                For a joint task, a member only earns credit for completing
                their own required subtasks.
              </Text>
            </View>
          </AlenioSheetCard>
          <AlenioSheetCard compact>
            <View style={styles.infoRow}>
              <CircleAlert size={19} color="#DC2626" />
              <Text style={styles.infoText}>
                A late completion breaks the current streak. Tasks without due
                dates and tasks not assigned to the member do not count.
              </Text>
            </View>
          </AlenioSheetCard>
          <AlenioSheetCard compact>
            <View style={styles.infoRow}>
              <Clock3 size={19} color="#64748B" />
              <Text style={styles.infoText}>
                After 30 days without a qualifying completion, the member moves
                to Ready to rebuild without losing their earned personal best.
              </Text>
            </View>
          </AlenioSheetCard>
        </View>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={!!selectedMember}
        title={selectedMember?.name || "Member momentum"}
        subtitle="Task streak and completion details"
        onClose={() => setSelectedMember(null)}
        showCloseButton
        showScrollIndicator
        bodyHeightRatio={0.72}
        testID="team-momentum-detail-sheet"
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={() => void refresh(true)}
            tintColor={colors.brand}
          />
        }
        footer={
          selectedMember ? (
            <Pressable
              style={({ pressed }) => [
                styles.profileButton,
                pressed && styles.profileButtonPressed,
              ]}
              onPress={() => {
                const userId = selectedMember.userId;
                setSelectedMember(null);
                router.push({
                  pathname: "/person",
                  params: { teamId, userId },
                });
              }}
              testID="team-momentum-view-profile-button"
              accessibilityRole="button"
              accessibilityLabel={`View ${selectedMember.name || "member"} profile`}
              accessibilityHint="Opens this member’s profile"
            >
              <Text style={styles.profileButtonText}>View profile</Text>
            </Pressable>
          ) : null
        }
      >
        {selectedMember ? (
          <View
            style={styles.detailContent}
            testID="team-momentum-member-detail"
          >
            {detailQuery.isPending ? (
              <View
                style={styles.detailState}
                testID="team-momentum-detail-loading"
                accessibilityRole="progressbar"
              >
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.detailStateText}>
                  Loading momentum details…
                </Text>
              </View>
            ) : detailQuery.isError ? (
              <View
                style={styles.detailState}
                testID="team-momentum-detail-error"
              >
                <Text style={styles.detailStateTitle}>
                  Momentum details are unavailable
                </Text>
                <Pressable
                  onPress={() => void detailQuery.refetch()}
                  style={styles.detailRetry}
                  testID="team-momentum-detail-retry-button"
                  accessibilityRole="button"
                  accessibilityLabel="Try loading momentum details again"
                >
                  <Text style={styles.detailRetryText}>Try again</Text>
                </Pressable>
              </View>
            ) : detail ? (
              <>
                <AlenioSheetCard tint="purple" compact>
                  <View
                    style={styles.detailSummary}
                    testID="team-momentum-detail-summary"
                    accessibilityRole="summary"
                    accessibilityLabel={`${detailStatus}. ${detail.member.currentStreak} earned task streak. ${detail.member.personalBestStreak} best task streak. ${detail.member.completedThisMonth} task completions this month. ${detail.member.overdueTaskCount} overdue tasks.`}
                  >
                    <UserAvatar
                      user={memberUser(detail.member)}
                      size={42}
                      radius={21}
                      backgroundColor="#EEF2FF"
                    />
                    <View style={styles.detailSummaryBody}>
                      <Text style={styles.detailStatus}>{detailStatus}</Text>
                      <Text style={styles.detailSummaryValue}>
                        {detail.member.currentStreak}{" "}
                        {detailBand === "ready_to_rebuild"
                          ? "earned"
                          : "current"}{" "}
                        · {detail.member.personalBestStreak} best task streak
                      </Text>
                      <Text style={styles.detailSummaryCopy}>
                        {detail.member.completedThisMonth} task completions this
                        month · {detail.member.overdueTaskCount} overdue
                      </Text>
                    </View>
                  </View>
                </AlenioSheetCard>

                <EvidenceSection
                  title="CURRENT-RUN COMPLETIONS"
                  emptyCopy="No current on-time task streak."
                  testID="team-momentum-current-run"
                >
                  {detail.currentRun.completions.length ? (
                    <>
                      <EvidenceList
                        count={detail.currentRun.completions.length}
                        testID="team-momentum-current-run-list"
                      >
                        {detail.currentRun.completions.map((completion) => (
                          <EvidenceRow
                            key={completion.creditId}
                            id={completion.creditId}
                            title={completion.title}
                            incognito={completion.incognito}
                            dateCopy={`${formatDate(completion.completedAt, "Completed")} · on time`}
                            tone="complete"
                            canOpen={completion.sourceTaskAvailable}
                            onPress={() => openCompletion(completion)}
                          />
                        ))}
                      </EvidenceList>
                      {detail.currentRun.truncated ? (
                        <Text style={styles.evidenceNote}>
                          Showing {detail.currentRun.returnedCount} of{" "}
                          {detail.currentRun.totalCount} task completions.
                        </Text>
                      ) : null}
                    </>
                  ) : undefined}
                </EvidenceSection>

                <EvidenceSection
                  title="LATEST STREAK BREAK"
                  emptyCopy="No late completion has broken a task streak."
                  testID="team-momentum-latest-streak-break"
                >
                  {detail.latestStreakBreakingLateCompletion ? (
                    <EvidenceList
                      count={1}
                      testID="team-momentum-latest-streak-break-list"
                    >
                      <EvidenceRow
                        id={detail.latestStreakBreakingLateCompletion.creditId}
                        title={detail.latestStreakBreakingLateCompletion.title}
                        incognito={
                          detail.latestStreakBreakingLateCompletion.incognito
                        }
                        dateCopy={`${formatDate(
                          detail.latestStreakBreakingLateCompletion.completedAt,
                          "Completed late",
                        )} · broke a ${detail.latestStreakBreakingLateCompletion.streakBeforeBreak}-completion task streak`}
                        tone="late"
                        canOpen={
                          detail.latestStreakBreakingLateCompletion
                            .sourceTaskAvailable
                        }
                        onPress={() =>
                          openCompletion(
                            detail.latestStreakBreakingLateCompletion!,
                          )
                        }
                      />
                    </EvidenceList>
                  ) : undefined}
                </EvidenceSection>

                <EvidenceSection
                  title="OVERDUE TASKS"
                  emptyCopy="No overdue tasks."
                  testID="team-momentum-overdue-tasks"
                >
                  {detail.overdueTasks.length ? (
                    <EvidenceList
                      count={detail.overdueTasks.length}
                      testID="team-momentum-overdue-task-list"
                    >
                      {detail.overdueTasks.map(
                        (task: TeamMomentumOverdueTaskSummary) => (
                          <EvidenceRow
                            key={task.id}
                            id={task.id}
                            title={task.title}
                            incognito={task.incognito}
                            dateCopy={formatDate(
                              task.overdueSince,
                              "Overdue since",
                            )}
                            tone="overdue"
                            canOpen
                            onPress={() => openTask(task.id)}
                          />
                        ),
                      )}
                    </EvidenceList>
                  ) : undefined}
                </EvidenceSection>

                <EvidenceSection
                  title="ACTIVE TASKS"
                  emptyCopy="No active tasks."
                  testID="team-momentum-active-tasks"
                >
                  {detail.activeTasks.length ? (
                    <EvidenceList
                      count={detail.activeTasks.length}
                      testID="team-momentum-active-task-list"
                    >
                      {detail.activeTasks.map(
                        (task: TeamMomentumActiveTaskSummary) => (
                          <EvidenceRow
                            key={task.id}
                            id={task.id}
                            title={task.title}
                            incognito={task.incognito}
                            dateCopy={
                              task.dueAt
                                ? formatDate(task.dueAt, "Due")
                                : "No due date"
                            }
                            tone="active"
                            canOpen
                            onPress={() => openTask(task.id)}
                          />
                        ),
                      )}
                    </EvidenceList>
                  ) : undefined}
                </EvidenceSection>
              </>
            ) : null}
          </View>
        ) : null}
      </AlenioBottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F8FC" },
  topBar: {
    minHeight: 60,
    paddingHorizontal: space.pagePad,
    flexDirection: "row",
    alignItems: "center",
  },
  sideButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { flex: 1, alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  switchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: space.pagePad,
    paddingBottom: 8,
  },
  switch: {
    flexDirection: "row",
    backgroundColor: "#EEF2F6",
    borderRadius: 999,
    padding: 3,
  },
  switchItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  switchItemOn: { backgroundColor: "#5B45FF" },
  switchText: { fontSize: 13, fontWeight: "700", color: "#475467" },
  switchTextOn: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  monthChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  monthChipText: { fontSize: 12, fontWeight: "700", color: "#344054" },
  ownerNote: {
    marginHorizontal: space.pagePad,
    marginTop: 12,
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    gap: 6,
  },
  content: { paddingHorizontal: space.pagePad, paddingTop: 8, gap: 14 },
  /** Landscape spends the width on a second column instead of a longer scroll. */
  splitRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  splitAside: { width: 320, gap: 14 },
  splitMain: { flex: 1, minWidth: 0, gap: 14 },
  stack: { gap: 14 },
  summary: {
    flexDirection: "row",
    padding: 18,
    alignItems: "center",
    gap: 13,
  },
  attention: { flexDirection: "row", padding: 16, gap: 13 },
  attentionAccent: {
    width: 3,
    borderRadius: 2,
    backgroundColor: "#D97706",
  },
  attentionBody: { flex: 1, minWidth: 0 },
  attentionEyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#B45309",
  },
  attentionHeadline: {
    marginTop: 3,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    color: "#0F172A",
  },
  attentionDetail: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
  attentionButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    minHeight: 38,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#5B45FF",
    alignItems: "center",
    justifyContent: "center",
  },
  attentionButtonText: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  rosterHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 9,
  },
  rosterLabel: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: "#94A3B8",
  },
  rosterCount: { fontSize: 11, fontWeight: "700", color: "#94A3B8" },
  explainerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#F1F4F9",
  },
  explainerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  dots: { flexDirection: "row", gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotEmpty: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  stateDot: { width: 7, height: 7, borderRadius: 4 },
  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EEEBFF",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryInfoButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#F3F0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryValue: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    color: "#0F172A",
  },
  /** Personal view only; the leader hero leads with the number instead. */
  summaryEyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: "#5B45FF",
    letterSpacing: 0.8,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 4,
    gap: 8,
  },
  contextText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#64748B" },
  summaryBody: { marginTop: 3, fontSize: 13, lineHeight: 19, color: "#64748B" },
  personalSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 18,
  },
  personalSummaryValue: {
    marginTop: 2,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "800",
    color: "#0F172A",
  },
  personalStats: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingVertical: 14,
  },
  personalStat: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  personalStatDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
  },
  personalStatValue: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    color: "#0F172A",
  },
  personalStatLabel: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 0.55,
    color: "#64748B",
    textAlign: "center",
  },
  memberRow: {
    minHeight: 64,
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  memberRowWithDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  rowPressed: { opacity: 0.65 },
  memberBody: { flex: 1, minWidth: 0, marginLeft: 11, marginRight: 6 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  memberName: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  memberStreakRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberStats: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "#475569",
  },
  workStats: { marginTop: 3, fontSize: 10, lineHeight: 13, color: "#64748B" },
  workStatsAttention: { color: "#B45309" },
  centerState: {
    flex: 1,
    paddingHorizontal: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#EEEBFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyCard: {
    paddingHorizontal: 24,
    paddingVertical: 30,
    alignItems: "center",
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  stateBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 18,
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: "#5B45FF",
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { color: "white", fontSize: 14, fontWeight: "800" },
  infoContent: { gap: 10 },
  infoRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#334155",
  },
  detailContent: { gap: 17 },
  detailSummary: { flexDirection: "row", alignItems: "center", gap: 12 },
  detailSummaryBody: { flex: 1, minWidth: 0 },
  detailStatus: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: "#5B45FF",
  },
  detailSummaryValue: {
    marginTop: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: "#0F172A",
  },
  detailSummaryCopy: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
  detailState: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  detailStateTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  detailStateText: { fontSize: 13, color: "#64748B" },
  detailRetry: {
    minHeight: 38,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  detailRetryText: { fontSize: 13, fontWeight: "800", color: "#5B45FF" },
  taskSection: { gap: 7 },
  taskSectionTitle: {
    paddingHorizontal: 2,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.7,
  },
  taskSectionEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    fontSize: 13,
    color: "#94A3B8",
  },
  evidenceRow: {
    minHeight: 48,
    marginBottom: 5,
    paddingLeft: 11,
    paddingRight: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E4EAF1",
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  evidenceRail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
  },
  evidenceIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceBody: { flex: 1, minWidth: 0 },
  evidenceTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  evidenceDate: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
  },
  evidenceNote: {
    paddingHorizontal: 4,
    fontSize: 11,
    lineHeight: 16,
    color: "#64748B",
  },
  profileButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#5B45FF",
    alignItems: "center",
    justifyContent: "center",
  },
  profileButtonPressed: { opacity: 0.75 },
  profileButtonText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
