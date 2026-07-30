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
  Target,
  Users,
} from "lucide-react-native";
import { router } from "expo-router";
import type { Team, TeamMember } from "@/lib/types";
import type { TeamHealthHistoryPoint } from "@/lib/team-health-history";
import type {
  MemberStandardsCompliance,
  MemberStatsPayload,
  MemberStatsRow,
} from "@/lib/workplace-standards";
import {
  buildNeedsAttention,
  timeOfDayGreeting,
  type CoachingPriorityFilter,
} from "@/lib/coaching-priorities";
import { UserAvatar } from "@/components/UserAvatar";
import { PendingInvitesChip } from "@/components/PendingInvitesSheet";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { CoachingPrioritySheet } from "@/components/people/CoachingPrioritySheet";
import { NeedsAttentionKey } from "@/components/people/NeedsAttentionKey";
import { colors } from "@/theme";
import { TeamSnapshotCard } from "@/components/seneca/TeamSnapshotCard";
import type { SenecaFocusResponse } from "@/lib/seneca-focus";
import { teamHealthBandForScore } from "@/lib/team-health-score";

const PAGE_PAD = 16;

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
  tasksPct: number | null;
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

function PriorityCard({
  label,
  status,
  score,
  tone,
  Icon,
  onPress,
  testID,
  showDivider,
}: {
  label: string;
  status: string;
  score: number;
  tone: "blue" | "purple" | "green";
  Icon: typeof Target;
  onPress: () => void;
  testID: string;
  showDivider: boolean;
}) {
  const palette =
    tone === "blue"
      ? { icon: "#4361EE", status: "#4361EE" }
      : tone === "purple"
        ? { icon: "#7C3AED", status: "#7C3AED" }
        : { icon: "#10B981", status: "#059669" };

  return (
    <View style={[styles.prioritySlot, showDivider ? styles.priorityDivider : null]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.priorityMetric,
          pressed ? { opacity: 0.72 } : null,
        ]}
        testID={testID}
      >
        <Icon size={15} color={palette.icon} strokeWidth={2.25} />
        <Text style={styles.priorityCount}>{score}%</Text>
        <Text style={styles.priorityLabel}>{label}</Text>
        <Text style={[styles.priorityStatus, { color: palette.status }]}>{status}</Text>
      </Pressable>
    </View>
  );
}

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
const METRIC_NEUTRAL = "#1E293B";

function checkInMetricLabel(
  status: MemberStandardsCompliance["checkInStatus"] | undefined,
): string {
  if (status === "due_soon") return "Due soon";
  if (status === "overdue") return "Due";
  return "Active";
}

function checkInMetricColor(
  status: MemberStandardsCompliance["checkInStatus"] | undefined,
): string {
  if (status === "due_soon") return METRIC_PARTIAL;
  if (status === "overdue") return METRIC_BAD;
  return METRIC_GOOD;
}

function completionMetricColor(pct: number | null): string {
  if (pct == null) return METRIC_NEUTRAL;
  if (pct >= 80) return METRIC_GOOD;
  if (pct >= 50) return METRIC_PARTIAL;
  return METRIC_BAD;
}

function goalsPctValue(goalsDisplay: string | undefined): number | null {
  const progress = (goalsDisplay ?? "").match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!progress) return null;
  const current = Number(progress[1]);
  const required = Number(progress[2]);
  if (!Number.isFinite(current) || !Number.isFinite(required) || required <= 0) return null;
  return Math.min(100, Math.round((current / required) * 100));
}

function goalsPctLabel(goalsDisplay: string | undefined): string {
  const pct = goalsPctValue(goalsDisplay);
  return pct == null ? "—" : `${pct}%`;
}

function tasksPctValue(stats: MemberStatsRow | undefined): number {
  const active = stats?.activeTasks ?? 0;
  const overdue = stats?.overdueTasks ?? 0;
  if (active <= 0) return 100;
  const onTime = Math.max(0, active - Math.min(active, overdue));
  return Math.round((onTime / active) * 100);
}

function tasksPctLabel(stats: MemberStatsRow | undefined): string {
  return `${tasksPctValue(stats)}%`;
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
  tasksPct,
  pendingApprovalCount,
  pendingInviteCount,
  senecaFocus,
  senecaFocusLoading,
  senecaFocusError,
  senecaFocusFetching,
  contentBottomPad,
  refreshing,
  onRefresh,
  onInvite: _onInvite,
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
  const needsAttentionPreview = needsAttentionAll.slice(0, 3);

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

  const openProfile = (userId: string) => {
    router.push({
      pathname: "/member-profile",
      params: { teamId, memberUserId: userId },
    });
  };

  const priorityCards = useMemo(
    () => [
      ...(checkInRequired
        ? [
            {
              key: "checkIn",
              label: "Check-ins",
              status: "On track",
              score: checkInPct ?? 100,
              tone: "blue" as const,
              Icon: CalendarClock,
              onPress: () => openPriority("checkInDue"),
              testID: "priority-check-ins",
            },
          ]
        : []),
      ...(goalsRequired
        ? [
            {
              key: "goals",
              label: "Goals",
              status: "Coverage",
              score: goalsPct ?? 100,
              tone: "purple" as const,
              Icon: Target,
              onPress: () => openPriority("goalsMissing"),
              testID: "priority-goals",
            },
          ]
        : []),
      {
        key: "overdue",
        label: "Tasks",
        status: "On time",
        score: tasksPct ?? 100,
        tone: "green" as const,
        Icon: CheckSquare,
        onPress: () => openPriority("overdueTasks"),
        testID: "priority-overdue-tasks",
      },
    ],
    [
      checkInPct,
      checkInRequired,
      goalsPct,
      goalsRequired,
      tasksPct,
    ],
  );
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
          <Text style={styles.greeting} numberOfLines={1}>
            {greeting}, {firstName}! 👋
          </Text>
          <View style={styles.summaryMetaRow}>
            <Pressable
              onPress={onOpenInsights}
              style={({ pressed }) => [
                styles.healthStatusRow,
                pressed ? { opacity: 0.75 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Team health ${teamHealthPct ?? "not available"}, ${healthLabel}`}
              testID="coaching-team-health-status"
            >
              <Text style={styles.healthStatusLabel} numberOfLines={1}>
                <Text style={[styles.healthStatusDot, { color: healthColor }]}>●{" "}</Text>
                Team health{" "}
                <Text style={styles.healthStatusValue}>
                  {teamHealthPct == null ? "—" : `${teamHealthPct}%`}
                </Text>
                {" · "}
                <Text style={[styles.healthStatusBand, { color: healthColor }]}>
                  {healthLabel}
                </Text>
              </Text>
            </Pressable>
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

        {(pendingApprovalCount > 0 || pendingInviteCount > 0) ? (
          <View style={styles.chipsRow}>
            {pendingApprovalCount > 0 ? (
              <Pressable onPress={onOpenJoinRequests} style={styles.chip} testID="pending-join-requests-chip">
                <Users size={11} color="#4338CA" />
                <Text style={styles.chipText}>
                  {pendingApprovalCount === 1 ? "1 request" : `${pendingApprovalCount} requests`}
                </Text>
              </Pressable>
            ) : null}
            <PendingInvitesChip count={pendingInviteCount} onPress={onOpenPendingInvites} />
          </View>
        ) : null}

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

        <View style={[styles.section, styles.coachingSection]}>
          <SectionHeader
            title="Coaching priorities"
            actionLabel="View all"
            onAction={openDirectory}
            actionTestID="priorities-view-all"
          />
          <View style={styles.priorityRow}>
            {priorityCards.map((card, index) => (
              <PriorityCard
                key={card.key}
                label={card.label}
                status={card.status}
                score={card.score}
                tone={card.tone}
                Icon={card.Icon}
                onPress={card.onPress}
                testID={card.testID}
                showDivider={index > 0}
              />
            ))}
          </View>
        </View>
        </View>

      {isPaid ? (
        <View style={[styles.section, styles.attentionSection]}>
          <SectionHeader
            title="Needs your attention"
            titleAccessory={
              <NeedsAttentionKey
                checkInRequired={checkInRequired}
                goalsRequired={goalsRequired}
              />
            }
            actionLabel={
              needsAttentionAll.length > 0
                ? `View all (${needsAttentionAll.length})`
                : undefined
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
          {needsAttentionAll.length === 0 ? (
            <View testID="needs-attention-scroll">
              <View style={styles.attentionCard}>
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
              </View>
            </View>
          ) : (
            <View testID="needs-attention-scroll">
              <View style={styles.attentionCard}>
                <View style={styles.attentionMetricsHeader}>
                  <View style={styles.attentionHeaderAvatarSpacer} />
                  <View style={styles.attentionHeaderNameSpacer} />
                  <View style={styles.attentionMetrics}>
                    {checkInRequired ? (
                      <View style={[styles.metricColumn, styles.checkInMetricColumn]}>
                        <Text style={styles.metricHeaderLabel}>Check-in</Text>
                      </View>
                    ) : null}
                    {goalsRequired ? (
                      <View style={styles.metricColumn}>
                        <Text style={styles.metricHeaderLabel}>Goals</Text>
                      </View>
                    ) : null}
                    <View style={styles.metricColumn}>
                      <Text style={styles.metricHeaderLabel}>Tasks</Text>
                    </View>
                  </View>
                  <View style={styles.attentionHeaderChevronSpacer} />
                </View>
                {needsAttentionPreview.map((item, index) => {
                  const checkInStatus = item.stats?.standardsCompliance?.checkInStatus;
                  const goalsDisplay = item.stats?.standardsCompliance?.goalsDisplay;
                  const showCheckIn = checkInRequired && checkInStatus !== "not_required";
                  return (
                    <View key={item.member.userId}>
                      {index > 0 ? <View style={styles.attentionRowDivider} /> : null}
                      <Pressable
                        onPress={() => openProfile(item.member.userId)}
                        style={({ pressed }) => [
                          styles.attentionRowPressable,
                          pressed ? styles.attentionRowPressed : null,
                        ]}
                        testID={`needs-attention-${item.member.userId}`}
                      >
                      <View style={styles.attentionRow}>
                        <View style={styles.avatarWrap}>
                          <UserAvatar
                            user={item.member.user}
                            size={26}
                            radius={13}
                            backgroundColor="#F1F5F9"
                            textColor="#334155"
                            fontSize={10}
                          />
                        </View>
                        <View style={styles.attentionCopy}>
                          <Text style={styles.attentionName} numberOfLines={1}>
                            {item.member.user.name?.trim() || "Member"}
                            {item.member.userId === myId ? " (you)" : ""}
                          </Text>
                        </View>
                        <View style={styles.attentionMetrics}>
                          {checkInRequired ? (
                            <View style={[styles.metricColumn, styles.checkInMetricColumn]}>
                              <Text
                                style={[
                                  styles.metricValue,
                                  { color: checkInMetricColor(checkInStatus) },
                                ]}
                                numberOfLines={1}
                              >
                                {showCheckIn ? checkInMetricLabel(checkInStatus) : "—"}
                              </Text>
                            </View>
                          ) : null}
                          {goalsRequired ? (
                            <View style={styles.metricColumn}>
                              <Text
                                style={[
                                  styles.metricValue,
                                  {
                                    color: completionMetricColor(
                                      goalsPctValue(goalsDisplay),
                                    ),
                                  },
                                ]}
                              >
                                {goalsPctLabel(goalsDisplay)}
                              </Text>
                            </View>
                          ) : null}
                          <View style={styles.metricColumn}>
                            <Text
                              style={[
                                styles.metricValue,
                                {
                                  color: completionMetricColor(tasksPctValue(item.stats)),
                                },
                              ]}
                            >
                              {tasksPctLabel(item.stats)}
                            </Text>
                          </View>
                        </View>
                        <ChevronRight size={14} color="#94A3B8" strokeWidth={2.25} />
                      </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.attentionSectionSpacer} />
      )}

        <View style={styles.browseFooter}>
          <Text style={styles.browseHeader}>People</Text>
          <ProfileCard>
            <Pressable
              onPress={openDirectory}
              style={({ pressed }) =>
                pressed ? styles.directoryCtaPressed : undefined
              }
              testID="browse-team-directory"
            >
              <View style={styles.directoryCta}>
                <View style={styles.directoryIcon}>
                  <Users size={15} color={colors.brand} strokeWidth={2.25} />
                </View>
                <View style={styles.directoryCopy}>
                  <Text style={styles.directoryTitle} numberOfLines={1}>
                    Team directory
                  </Text>
                  <Text style={styles.directorySub} numberOfLines={1}>
                    {memberCount} member{memberCount === 1 ? "" : "s"}
                  </Text>
                </View>
                <ChevronRight size={16} color="#C0C7D1" strokeWidth={2.25} />
              </View>
            </Pressable>
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
  attentionSectionSpacer: {
    height: 0,
  },
  summaryHeader: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  greeting: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
    color: "#172033",
    letterSpacing: -0.3,
  },
  summaryMetaRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  healthStatusRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    alignSelf: "flex-start",
    flexShrink: 1,
  },
  healthStatusDot: {
    fontSize: 9,
    fontWeight: "500",
  },
  healthStatusLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: "#64748B",
  },
  healthStatusValue: {
    fontWeight: "700",
    color: "#475569",
  },
  healthStatusBand: {
    fontWeight: "700",
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
  topCardRow: {
    height: 172,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 8,
  },
  healthCard: {
    width: "48.7%",
    height: "100%",
    position: "relative",
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E9E3FF",
    paddingHorizontal: 8,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  focusCardSlot: {
    width: "48.7%",
    height: "100%",
  },
  topCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 18,
  },
  healthRingPosition: {
    position: "absolute",
    top: 36,
    width: 100,
    height: 100,
  },
  healthTrendCopy: {
    width: 50,
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 2,
  },
  healthTrendDelta: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    color: "#10B981",
    textAlign: "right",
  },
  healthTrendCaption: {
    fontSize: 7,
    lineHeight: 8,
    fontWeight: "600",
    color: "#94A3B8",
    textAlign: "right",
  },
  healthTrendSummary: {
    marginTop: 2,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "700",
    color: "#475569",
    textAlign: "right",
  },
  healthRingValue: {
    fontSize: 26,
    lineHeight: 28,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  healthRingStatus: {
    width: 82,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: "800",
    textAlign: "center",
    textTransform: "uppercase",
  },
  topCardAction: {
    height: 24,
    borderRadius: 7,
    backgroundColor: "#F6F2FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  topCardActionText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#7C3AED",
  },
  healthTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  healthTrend: {
    width: 154,
    alignItems: "flex-end",
    flexShrink: 0,
  },
  healthTrendNote: {
    marginTop: 2,
    width: "100%",
    fontSize: 7,
    fontWeight: "600",
    color: "#94A3B8",
    textAlign: "right",
  },
  healthTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
  },
  healthValue: {
    marginTop: 0,
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -1,
  },
  healthBreakdown: {
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "stretch",
  },
  healthDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
    marginVertical: 2,
  },
  healthCell: {
    flex: 1,
    alignItems: "center",
    gap: 1,
    paddingHorizontal: 2,
  },
  healthCellValue: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
  },
  healthCellLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: "#94A3B8",
  },
  section: {
    gap: 0,
  },
  focusSection: {
    width: "100%",
  },
  coachingSection: {
    marginTop: 23,
  },
  attentionSection: {
    marginTop: 48,
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
  priorityRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 82,
  },
  prioritySlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    justifyContent: "center",
  },
  priorityDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "#E2E8F0",
  },
  priorityMetric: {
    minHeight: 82,
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  priorityCount: {
    marginTop: 5,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: "700",
    color: "#172033",
    letterSpacing: -0.35,
    textAlign: "center",
  },
  priorityLabel: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
  },
  priorityStatus: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  attentionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E7EBF1",
    overflow: "hidden",
  },
  attentionMetricsHeader: {
    minHeight: 22,
    paddingHorizontal: 7,
    paddingTop: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  attentionHeaderAvatarSpacer: {
    width: 26,
    flexShrink: 0,
  },
  attentionHeaderNameSpacer: {
    flex: 1,
    minWidth: 0,
  },
  attentionHeaderChevronSpacer: {
    width: 14,
    flexShrink: 0,
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
  avatarWrap: {
    position: "relative",
    width: 26,
    height: 26,
    flexShrink: 0,
  },
  attentionRowPressable: {
    backgroundColor: "#FFFFFF",
  },
  attentionRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E7EBF1",
    marginHorizontal: 9,
  },
  attentionRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  attentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 44,
    maxHeight: 44,
    paddingHorizontal: 7,
    width: "100%",
  },
  attentionCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  attentionName: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 15,
  },
  attentionMetrics: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
    gap: 5,
  },
  metricColumn: {
    alignItems: "center",
    minWidth: 36,
  },
  checkInMetricColumn: {
    minWidth: 48,
  },
  metricHeaderLabel: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textAlign: "center",
  },
  metricValue: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#1E293B",
  },
  browseFooter: {
    flexShrink: 0,
    gap: 8,
    marginTop: "auto",
    paddingTop: 23,
    paddingBottom: 0,
    width: "100%",
  },
  browseHeader: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.55,
    textTransform: "uppercase",
  },
  directoryCta: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minHeight: 54,
    paddingLeft: 12,
    paddingRight: 46,
    paddingVertical: 8,
  },
  directoryCtaPressed: {
    backgroundColor: "rgba(15, 23, 42, 0.03)",
  },
  directoryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    flexShrink: 0,
  },
  directoryCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
    justifyContent: "center",
  },
  directoryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  directorySub: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "500",
    color: "#64748B",
  },
});
