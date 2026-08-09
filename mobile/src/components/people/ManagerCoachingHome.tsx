import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import {
  CalendarClock,
  CheckSquare,
  ChevronRight,
  Settings2,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react-native";
import { router } from "expo-router";
import type { Team, TeamMember } from "@/lib/types";
import type { TeamHealthHistoryPoint } from "@/lib/team-health-history";
import type { MemberStatsPayload } from "@/lib/workplace-standards";
import {
  buildNeedsAttention,
  timeOfDayGreeting,
  type CoachingPriorityFilter,
  type NeedsAttentionItem,
} from "@/lib/coaching-priorities";
import { UserAvatar } from "@/components/UserAvatar";
import { PendingInvitesChip } from "@/components/PendingInvitesSheet";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { CoachingPrioritySheet } from "@/components/people/CoachingPrioritySheet";
import { TeamHealthRing } from "@/components/people/TeamHealthRing";
import { colors } from "@/theme";
import { TeamSnapshotCard } from "@/components/seneca/TeamSnapshotCard";
import type { SenecaFocusResponse } from "@/lib/seneca-focus";
import { teamHealthBandForScore } from "@/lib/team-health-score";

const PAGE_PAD = 16;
const DIRECTORY_AVATARS = 6;

type Props = {
  team: Team | undefined;
  members: TeamMember[];
  myId: string;
  managerName: string;
  managerImage?: string | null;
  isPaid: boolean;
  isOwner: boolean;
  memberStats?: MemberStatsPayload["stats"];
  checkInRequired: boolean;
  goalsRequired: boolean;
  teamHealthPct: number | null;
  checkInPct: number | null;
  goalsPct: number | null;
  /** Share of managed members recognized recently; shown as the Engagement band. */
  recognitionPct: number | null;
  unrecognizedCount: number;
  healthHistory: TeamHealthHistoryPoint[];
  pendingApprovalCount: number;
  pendingInviteCount: number;
  senecaFocus?: SenecaFocusResponse;
  senecaFocusLoading: boolean;
  senecaFocusError: boolean;
  senecaFocusFetching: boolean;
  contentBottomPad: number;
  refreshing: boolean;
  onRefresh: () => void;
  onInvite: () => void;
  onOpenInsights: () => void;
  onOpenJoinRequests: () => void;
  onOpenPendingInvites: () => void;
  onOpenWorkspaceSettings: () => void;
  onOpenSenecaFocus: () => void;
};

function SectionHeader({
  title,
  titleAccessory,
  actionLabel,
  onAction,
  actionTestID,
}: {
  title: string;
  titleAccessory?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {titleAccessory}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} testID={actionTestID}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const METRIC_GOOD = "#059669";
const METRIC_PARTIAL = "#D97706";
const METRIC_BAD = "#DC2626";

function pctColor(pct: number | null): string {
  if (pct == null) return "#94A3B8";
  if (pct >= 80) return METRIC_GOOD;
  if (pct >= 50) return METRIC_PARTIAL;
  return METRIC_BAD;
}

/** Recognition share reads better as a band than as a raw percentage. */
function engagementBand(pct: number | null): { label: string; color: string } {
  if (pct == null) return { label: "—", color: "#94A3B8" };
  if (pct >= 60) return { label: "High", color: METRIC_GOOD };
  if (pct >= 30) return { label: "Medium", color: METRIC_PARTIAL };
  return { label: "Low", color: METRIC_BAD };
}

type AttentionGroupKey = "checkIn" | "tasks" | "goals";

/** Mirrors the precedence inside buildNeedsAttention so the row lands in one bucket. */
function attentionGroupFor(
  item: NeedsAttentionItem,
  checkInRequired: boolean,
  goalsRequired: boolean,
): AttentionGroupKey | null {
  const compliance = item.stats?.standardsCompliance;
  if (checkInRequired && compliance?.checkInStatus === "overdue") return "checkIn";
  if ((item.stats?.overdueTasks ?? 0) > 0) return "tasks";
  if (checkInRequired && compliance?.checkInStatus === "due_soon") return "checkIn";
  if (goalsRequired && compliance?.goalsStatus === "missing_goals") return "goals";
  return null;
}

const ATTENTION_GROUP_META: Record<
  AttentionGroupKey,
  { filter: CoachingPriorityFilter; Icon: typeof Target; color: string; tint: string }
> = {
  checkIn: { filter: "checkInDue", Icon: CalendarClock, color: "#DC2626", tint: "#FEF2F2" },
  tasks: { filter: "overdueTasks", Icon: CheckSquare, color: "#D97706", tint: "#FFFBEB" },
  goals: { filter: "goalsMissing", Icon: Target, color: "#7C3AED", tint: "#F5F3FF" },
};

function attentionSummary(key: AttentionGroupKey, items: NeedsAttentionItem[]): string {
  if (key === "checkIn") {
    return items.length === 1 ? "1 check-in overdue" : `${items.length} check-ins overdue`;
  }
  if (key === "tasks") {
    const tasks = items.reduce((total, item) => total + (item.stats?.overdueTasks ?? 0), 0);
    return tasks === 1 ? "1 task overdue" : `${tasks} tasks overdue`;
  }
  return items.length === 1 ? "1 member needs goals" : `${items.length} members need goals`;
}

function memberFirstName(member: TeamMember): string {
  const name = member.user.name?.trim() ?? "";
  return name.split(/\s+/)[0] || "Member";
}

export function ManagerCoachingHome({
  team,
  members,
  myId,
  managerName,
  isPaid,
  isOwner,
  memberStats,
  checkInRequired,
  goalsRequired,
  teamHealthPct,
  checkInPct,
  goalsPct,
  recognitionPct,
  unrecognizedCount,
  healthHistory,
  pendingApprovalCount,
  pendingInviteCount,
  senecaFocus,
  senecaFocusLoading,
  senecaFocusError,
  senecaFocusFetching,
  contentBottomPad,
  refreshing,
  onRefresh,
  onInvite,
  onOpenInsights,
  onOpenJoinRequests,
  onOpenPendingInvites,
  onOpenWorkspaceSettings,
  onOpenSenecaFocus,
}: Props) {
  const greeting = timeOfDayGreeting();
  const firstName = managerName.trim().split(/\s+/)[0] || "there";
  const healthBand = teamHealthBandForScore(teamHealthPct);
  const healthColor = healthBand?.color ?? "#94A3B8";
  const healthLabel = healthBand?.label ?? "Learning";
  const teamId = team?.id ?? "";
  const memberCount = members.length;
  const myRole = team?.role;
  const myEmail = members.find((member) => member.userId === myId)?.user.email ?? "";
  const [priorityFilter, setPriorityFilter] = useState<CoachingPriorityFilter | null>(null);

  const needsAttentionAll = useMemo(
    () =>
      buildNeedsAttention({
        members,
        memberStats,
        standards: { checkInRequired, goalsRequired },
        limit: 50,
      }),
    [checkInRequired, goalsRequired, members, memberStats],
  );

  const attentionGroups = useMemo(() => {
    const buckets = new Map<AttentionGroupKey, NeedsAttentionItem[]>();
    for (const item of needsAttentionAll) {
      const key = attentionGroupFor(item, checkInRequired, goalsRequired);
      if (!key) continue;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);
    }
    return (["checkIn", "tasks", "goals"] as AttentionGroupKey[])
      .map((key) => ({ key, items: buckets.get(key) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [needsAttentionAll, checkInRequired, goalsRequired]);

  /** Oldest → newest delta over whatever window the history query returned. */
  const healthTrend = useMemo(() => {
    if (healthHistory.length < 2 || teamHealthPct == null) return null;
    const sorted = [...healthHistory].sort((a, b) => a.date.localeCompare(b.date));
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    const days = Math.max(
      1,
      Math.round(
        (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / 86_400_000,
      ),
    );
    return { delta: newest.teamHealthPct - oldest.teamHealthPct, days };
  }, [healthHistory, teamHealthPct]);

  const healthMetrics = useMemo(() => {
    const engagement = engagementBand(recognitionPct);
    return [
      ...(checkInRequired
        ? [
            {
              key: "checkIns",
              label: "Check-ins",
              value: checkInPct == null ? "—" : `${checkInPct}%`,
              color: pctColor(checkInPct),
            },
          ]
        : []),
      ...(goalsRequired
        ? [
            {
              key: "goals",
              label: "Goals",
              value: goalsPct == null ? "—" : `${goalsPct}%`,
              color: pctColor(goalsPct),
            },
          ]
        : []),
      {
        key: "engagement",
        label: "Engagement",
        value: engagement.label,
        color: engagement.color,
      },
    ];
  }, [checkInPct, checkInRequired, goalsPct, goalsRequired, recognitionPct]);

  const openPriority = (filter: CoachingPriorityFilter) => {
    setPriorityFilter(filter);
  };

  const openDirectory = () => {
    if (!teamId) return;
    router.push({
      pathname: "/team-directory",
      params: { teamId },
    });
  };

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor="#4361EE"
      colors={["#4361EE"]}
    />
  );

  return (
    <View style={styles.screen} testID="manager-coaching-home">
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={[
          styles.pageScrollContent,
          { paddingBottom: contentBottomPad },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        <View style={styles.fixedTop}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryMetaRow}>
              <Text style={styles.greeting} numberOfLines={1}>
                {greeting}, {firstName}! 👋
              </Text>
              {isOwner ? (
                <Pressable
                  onPress={onOpenWorkspaceSettings}
                  style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
                  hitSlop={8}
                  testID="coaching-team-settings"
                >
                  <View style={styles.settingsPill}>
                    <Settings2 size={11} color={colors.brand} strokeWidth={2.4} />
                    <Text style={styles.settingsPillText}>Team settings</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          </View>

          {pendingApprovalCount > 0 || pendingInviteCount > 0 ? (
            <View style={styles.chipsRow}>
              {pendingApprovalCount > 0 ? (
                <Pressable
                  onPress={onOpenJoinRequests}
                  style={styles.chip}
                  testID="pending-join-requests-chip"
                >
                  <Users size={11} color="#4338CA" />
                  <Text style={styles.chipText}>
                    {pendingApprovalCount === 1 ? "1 request" : `${pendingApprovalCount} requests`}
                  </Text>
                </Pressable>
              ) : null}
              <PendingInvitesChip count={pendingInviteCount} onPress={onOpenPendingInvites} />
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader
              title="Team health"
              actionLabel="See details"
              onAction={onOpenInsights}
              actionTestID="coaching-team-health-details"
            />
            <ProfileCard style={styles.healthCard}>
              <Pressable
                onPress={onOpenInsights}
                style={({ pressed }) => [styles.healthCardRow, pressed ? { opacity: 0.85 } : null]}
                accessibilityRole="button"
                accessibilityLabel={`Team health ${teamHealthPct ?? "not available"}, ${healthLabel}`}
                testID="coaching-team-health-status"
              >
                <View style={styles.healthCardLeft}>
                  <TeamHealthRing value={teamHealthPct} color={healthColor} />
                  <Text style={[styles.healthBandLabel, { color: healthColor }]} numberOfLines={1}>
                    {healthLabel}
                  </Text>
                  {healthTrend ? (
                    <View style={styles.healthTrendRow}>
                      {healthTrend.delta >= 0 ? (
                        <TrendingUp size={11} color={METRIC_GOOD} strokeWidth={2.4} />
                      ) : (
                        <TrendingDown size={11} color={METRIC_BAD} strokeWidth={2.4} />
                      )}
                      <Text
                        style={[
                          styles.healthTrendText,
                          { color: healthTrend.delta >= 0 ? METRIC_GOOD : METRIC_BAD },
                        ]}
                      >
                        {healthTrend.delta >= 0 ? "+" : ""}
                        {healthTrend.delta}%
                      </Text>
                      <Text style={styles.healthTrendCaption} numberOfLines={1}>
                        vs {healthTrend.days} days ago
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.healthMetrics}>
                  {healthMetrics.map((metric, index) => (
                    <View
                      key={metric.key}
                      style={[styles.healthMetricRow, index > 0 ? styles.healthMetricDivider : null]}
                      testID={`team-health-metric-${metric.key}`}
                    >
                      <Text style={styles.healthMetricLabel} numberOfLines={1}>
                        {metric.label}
                      </Text>
                      <Text style={[styles.healthMetricValue, { color: metric.color }]}>
                        {metric.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            </ProfileCard>
          </View>

          {isPaid ? (
            <View style={styles.focusSection}>
              <ProfileCard
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 22,
                  minHeight: 140,
                }}
              >
                <TeamSnapshotCard
                  focus={senecaFocus}
                  isLoading={senecaFocusLoading}
                  isError={senecaFocusError}
                  isFetching={senecaFocusFetching}
                  affectedMembers={members
                    .filter((member) =>
                      senecaFocus?.brief.affectedMemberIds.includes(member.userId),
                    )
                    .map((member) => member.user)}
                  onOpenFocus={onOpenSenecaFocus}
                />
              </ProfileCard>
            </View>
          ) : null}
        </View>

        {isPaid ? (
          <View style={[styles.section, styles.attentionSection]}>
            <SectionHeader
              title="Needs your attention"
              actionLabel={
                needsAttentionAll.length > 0 ? `View all (${needsAttentionAll.length})` : undefined
              }
              onAction={
                needsAttentionAll.length > 0
                  ? () =>
                      openPriority(
                        checkInRequired
                          ? "checkInDue"
                          : goalsRequired
                            ? "goalsMissing"
                            : "overdueTasks",
                      )
                  : undefined
              }
              actionTestID="needs-attention-view-all"
            />
            <View style={styles.attentionCard} testID="needs-attention-scroll">
              {attentionGroups.length === 0 ? (
                <View style={styles.emptyAttention}>
                  <Text style={styles.emptyAttentionText}>Everyone is on track today.</Text>
                  <Pressable
                    onPress={() => router.push("/(app)/activity")}
                    hitSlop={6}
                    testID="attention-recognition-nudge"
                  >
                    <Text style={styles.emptyAttentionLink}>Recognize someone on Activity</Text>
                  </Pressable>
                </View>
              ) : (
                attentionGroups.map((group, index) => {
                  const meta = ATTENTION_GROUP_META[group.key];
                  const names = group.items.map((item) => memberFirstName(item.member));
                  return (
                    <Pressable
                      key={group.key}
                      onPress={() => openPriority(meta.filter)}
                      style={({ pressed }) => [
                        styles.attentionRow,
                        index > 0 ? styles.attentionRowDivider : null,
                        pressed ? styles.attentionRowPressed : null,
                      ]}
                      testID={`needs-attention-${group.key}`}
                    >
                      <View style={[styles.attentionIcon, { backgroundColor: meta.tint }]}>
                        <meta.Icon size={15} color={meta.color} strokeWidth={2.3} />
                      </View>
                      <View style={styles.attentionCopy}>
                        <Text style={styles.attentionSummary} numberOfLines={1}>
                          {attentionSummary(group.key, group.items)}
                        </Text>
                        <Text style={styles.attentionNames} numberOfLines={1}>
                          {names.join(", ")}
                        </Text>
                      </View>
                      <ChevronRight size={16} color="#C0C7D1" strokeWidth={2.25} />
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        ) : null}

        {isPaid && unrecognizedCount > 0 ? (
          <View style={[styles.section, styles.coachingInsightsSection]}>
            <SectionHeader title="Coaching insights" />
            <ProfileCard>
              <Pressable
                onPress={openDirectory}
                style={({ pressed }) => [
                  styles.insightRow,
                  pressed ? styles.attentionRowPressed : null,
                ]}
                testID="coaching-insight-recognition"
              >
                <View style={[styles.attentionIcon, { backgroundColor: "#FFFBEB" }]}>
                  <Sparkles size={15} color="#D97706" strokeWidth={2.3} />
                </View>
                <View style={styles.attentionCopy}>
                  <Text style={styles.attentionSummary} numberOfLines={1}>
                    {unrecognizedCount === 1
                      ? "1 team member could use recognition"
                      : `${unrecognizedCount} team members could use recognition`}
                  </Text>
                  <Text style={styles.attentionNames} numberOfLines={1}>
                    No celebration in the last 14 days
                  </Text>
                </View>
                <ChevronRight size={16} color="#C0C7D1" strokeWidth={2.25} />
              </Pressable>
            </ProfileCard>
          </View>
        ) : null}

        <View style={styles.browseFooter}>
          <SectionHeader
            title="Team directory"
            actionLabel="See all"
            onAction={openDirectory}
            actionTestID="browse-team-directory"
          />
          <ProfileCard style={styles.directoryCard}>
            <Text style={styles.directorySub}>
              {memberCount} member{memberCount === 1 ? "" : "s"}
            </Text>
            <View style={styles.directoryRow}>
              <Pressable
                onPress={openDirectory}
                style={styles.directoryAvatars}
                testID="directory-avatar-row"
              >
                {members.slice(0, DIRECTORY_AVATARS).map((member) => (
                  <View key={member.userId} style={styles.directoryAvatarWrap}>
                    <UserAvatar
                      user={member.user}
                      size={38}
                      radius={19}
                      backgroundColor="#EEF2FF"
                      textColor={colors.brand}
                      fontSize={14}
                    />
                  </View>
                ))}
                {memberCount > DIRECTORY_AVATARS ? (
                  <View style={[styles.directoryAvatarWrap, styles.directoryOverflow]}>
                    <Text style={styles.directoryOverflowText}>
                      +{memberCount - DIRECTORY_AVATARS}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                onPress={onInvite}
                style={({ pressed }) => [styles.inviteCircle, pressed ? { opacity: 0.8 } : null]}
                accessibilityRole="button"
                accessibilityLabel="Invite people"
                testID="directory-invite-button"
              >
                <UserPlus size={17} color={colors.brand} strokeWidth={2.3} />
              </Pressable>
            </View>
          </ProfileCard>
        </View>
      </ScrollView>

      <CoachingPrioritySheet
        visible={priorityFilter != null}
        filter={priorityFilter}
        teamId={teamId}
        members={members}
        memberStats={memberStats}
        checkInRequired={checkInRequired}
        goalsRequired={goalsRequired}
        myId={myId}
        myEmail={myEmail}
        myRole={myRole}
        onClose={() => setPriorityFilter(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  pageScroll: {
    flex: 1,
  },
  pageScrollContent: {
    paddingHorizontal: PAGE_PAD,
    flexGrow: 1,
  },
  fixedTop: {
    paddingTop: 32,
    flexShrink: 0,
  },
  summaryHeader: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  greeting: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
    color: "#172033",
    letterSpacing: -0.3,
  },
  summaryMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  settingsPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 1,
    flexShrink: 0,
  },
  settingsPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.brand,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4338CA",
  },
  healthCard: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  healthCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  healthCardLeft: {
    width: 112,
    flexShrink: 0,
    alignItems: "center",
    gap: 6,
  },
  healthBandLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  healthTrendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  healthTrendText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  healthTrendCaption: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    color: "#94A3B8",
  },
  healthMetrics: {
    flex: 1,
    minWidth: 0,
  },
  healthMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 9,
  },
  healthMetricDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F7",
  },
  healthMetricLabel: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  healthMetricValue: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
  },
  section: {
    gap: 0,
  },
  focusSection: {
    width: "100%",
    marginTop: 20,
  },
  attentionSection: {
    marginTop: 26,
  },
  coachingInsightsSection: {
    marginTop: 26,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 6,
  },
  sectionTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  sectionAction: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.brand,
  },
  attentionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E7EBF1",
    overflow: "hidden",
  },
  emptyAttention: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  emptyAttentionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  emptyAttentionLink: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand,
  },
  attentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#FFFFFF",
  },
  attentionRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E7EBF1",
  },
  attentionRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  attentionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  attentionCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  attentionSummary: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  attentionNames: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: "#7A869A",
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  browseFooter: {
    flexShrink: 0,
    marginTop: "auto",
    paddingTop: 26,
    width: "100%",
  },
  directoryCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  directorySub: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  directoryRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  directoryAvatars: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  directoryAvatarWrap: {
    marginRight: -8,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  directoryOverflow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  directoryOverflowText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  inviteCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#C7D2FE",
    backgroundColor: "#F8FAFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
