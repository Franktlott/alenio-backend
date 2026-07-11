import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import {
  fetchDevelopmentGoals,
  fetchOneOnOneMeetings,
  type DevelopmentGoal,
} from "@/lib/member-profile-api";
import { oneOnOnePublishedAt, latestPublishedCheckInForStandards } from "@/lib/one-on-one-dates";
import { calendarDaysSinceDate } from "@/lib/member-stats-display";

import {
  DEFAULT_WORKPLACE_STANDARDS,
  formatCheckInFrequencySummary,
  memberStandardsBadges,
  standardsBadgeColors,
  type MemberStandardsCompliance,
  type WorkplaceStandards,
} from "@/lib/workplace-standards";
import { StandardsStatusKey } from "@/components/StandardsStatusKey";

type Props = {
  teamId: string;
  memberUserId: string;
  streak?: number;
  overdueFollowUpTasks?: number;
  workplaceStandards?: WorkplaceStandards;
  standardsCompliance?: MemberStandardsCompliance;
  daysSinceLastCheckIn?: number | null;
};

function formatDateOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function lastUpdatedAt(goal: DevelopmentGoal): string {
  if (goal.notes.length === 0) return goal.createdAt;
  return goal.notes.reduce(
    (latest, note) => (new Date(note.createdAt) > new Date(latest) ? note.createdAt : latest),
    goal.notes[0].createdAt,
  );
}

function daysSinceDate(iso: string): number {
  return calendarDaysSinceDate(iso);
}

function daysSinceText(days: number): string {
  if (days === 1) return "1 day";
  return `${days} days`;
}

function formatUpdatedWithDays(iso: string): string {
  const days = daysSinceDate(iso);
  return `${formatDateOnly(iso)} · ${daysSinceText(days)}`;
}

function SectionCard({
  title,
  trailing,
  children,
  flex,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  flex?: number;
}) {
  return (
    <View
      style={{
        flex: flex ?? undefined,
        backgroundColor: "white",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E0E7FF",
        overflow: "hidden",
        shadowColor: "#0F172A",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#E8ECFA",
          backgroundColor: "#FAFBFF",
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "800", color: "#0F172A", flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        {trailing}
      </View>
      <View style={{ flex: flex ? 1 : undefined, paddingHorizontal: 14, paddingVertical: 12 }}>
        {children}
      </View>
    </View>
  );
}

function KpiCell({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text
        style={{
          fontSize: 9,
          fontWeight: "700",
          color: "#94A3B8",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 15,
          fontWeight: "800",
          color: warning ? "#B91C1C" : "#0F172A",
          marginTop: 3,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export function ProfileOverviewTab({
  teamId,
  memberUserId,
  streak,
  overdueFollowUpTasks,
  workplaceStandards,
  standardsCompliance,
  daysSinceLastCheckIn,
}: Props) {
  const standards = workplaceStandards ?? DEFAULT_WORKPLACE_STANDARDS;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeGoals, setActiveGoals] = useState<DevelopmentGoal[]>([]);
  const [lastOneOnOneDate, setLastOneOnOneDate] = useState<string | null>(null);
  const [oneOnOneCount, setOneOnOneCount] = useState(0);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [goals, meetings] = await Promise.all([
        fetchDevelopmentGoals(teamId, memberUserId),
        fetchOneOnOneMeetings(teamId, memberUserId),
      ]);

      const active = goals
        .filter((goal) => goal.status === "active")
        .sort(
          (a, b) => new Date(lastUpdatedAt(b)).getTime() - new Date(lastUpdatedAt(a)).getTime(),
        );
      setActiveGoals(active);
      const publishedMeetings = meetings.filter((meeting) => meeting.status !== "draft");
      setOneOnOneCount(publishedMeetings.length);

      const latestMeeting = latestPublishedCheckInForStandards(meetings, standards);
      setLastOneOnOneDate(latestMeeting ? oneOnOnePublishedAt(latestMeeting) : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load overview.");
      setActiveGoals([]);
      setLastOneOnOneDate(null);
      setOneOnOneCount(0);
    } finally {
      setLoading(false);
    }
  }, [memberUserId, teamId, standards.requiredCheckInTemplateId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const daysSinceOneOnOne = useMemo(() => {
    if (daysSinceLastCheckIn != null) return daysSinceLastCheckIn;
    return lastOneOnOneDate ? daysSinceDate(lastOneOnOneDate) : null;
  }, [daysSinceLastCheckIn, lastOneOnOneDate]);

  const snapshotGoals = activeGoals.slice(0, 3);

  if (loading && activeGoals.length === 0 && !err) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#4361EE" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, gap: 10 }}>
      <SectionCard title="Member snapshot">
        {err ? (
          <Text style={{ fontSize: 12, color: "#DC2626" }}>{err}</Text>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <KpiCell label="Active goals" value={loading ? "—" : String(activeGoals.length)} />
              <KpiCell
                label="Last check-in"
                value={loading ? "—" : lastOneOnOneDate ? formatDateOnly(lastOneOnOneDate) : "None"}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <KpiCell
                label="Days since"
                value={loading ? "—" : lastOneOnOneDate ? daysSinceText(daysSinceOneOnOne ?? 0) : "—"}
              />
              <KpiCell label="Check-ins" value={loading ? "—" : String(oneOnOneCount)} />
            </View>
            {(streak != null && streak > 0) || (overdueFollowUpTasks != null && overdueFollowUpTasks > 0) ? (
              <View style={{ flexDirection: "row", gap: 12 }}>
                {streak != null && streak > 0 ? <KpiCell label="Streak" value={`${streak}d`} /> : <View style={{ flex: 1 }} />}
                {overdueFollowUpTasks != null && overdueFollowUpTasks > 0 ? (
                  <KpiCell label="Overdue" value={String(overdueFollowUpTasks)} warning />
                ) : (
                  <View style={{ flex: 1 }} />
                )}
              </View>
            ) : null}
          </View>
        )}
      </SectionCard>

      <SectionCard
        title="Standards status"
        trailing={<StandardsStatusKey iconSize={14} />}
      >
        <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Check-in
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", marginTop: 2 }} numberOfLines={1}>
              {standards.checkInRequired ? formatCheckInFrequencySummary(standards) : "Not required"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Goals
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", marginTop: 2 }} numberOfLines={1}>
              {standards.goalsRequired
                ? `${standards.minimumActiveGoals} active goal${standards.minimumActiveGoals === 1 ? "" : "s"}`
                : "Not required"}
            </Text>
          </View>
        </View>

        {standardsCompliance ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {memberStandardsBadges(standardsCompliance, daysSinceOneOnOne).map((badge) => {
                const colors = standardsBadgeColors(badge.variant);
                return (
                  <View
                    key={badge.key}
                    accessibilityLabel={badge.title}
                    style={{
                      backgroundColor: colors.bg,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "800",
                        color: colors.text,
                        letterSpacing: 0.4,
                      }}
                    >
                      {badge.label.toUpperCase()}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={{ marginTop: 8, gap: 2 }}>
              {standardsCompliance.checkInStatus !== "not_required" ? (
                <Text style={{ fontSize: 12, color: "#475569" }} numberOfLines={2}>
                  {standardsCompliance.checkInActionText}
                </Text>
              ) : null}
              {standardsCompliance.goalsStatus !== "not_required" ? (
                <Text style={{ fontSize: 12, color: "#475569" }} numberOfLines={2}>
                  {standardsCompliance.goalsActionText}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Development goals"
        flex={1}
        trailing={
          activeGoals.length > 0 ? (
            <View
              style={{
                backgroundColor: "#EEF2FF",
                borderRadius: 999,
                minWidth: 20,
                height: 20,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 6,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#4361EE" }}>{activeGoals.length}</Text>
            </View>
          ) : null
        }
      >
        {activeGoals.length === 0 ? (
          <Text style={{ fontSize: 13, color: "#94A3B8" }}>No active development goals.</Text>
        ) : (
          <View style={{ gap: 0, flex: 1 }}>
            {snapshotGoals.map((goal, index) => (
              <View
                key={goal.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 8,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: "#F1F5F9",
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
                    {goal.skill}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }} numberOfLines={1}>
                    {formatUpdatedWithDays(lastUpdatedAt(goal))}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: "#DCFCE7",
                    borderRadius: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#166534" }}>Active</Text>
                </View>
              </View>
            ))}
            {activeGoals.length > snapshotGoals.length ? (
              <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                +{activeGoals.length - snapshotGoals.length} more on Growth
              </Text>
            ) : null}
          </View>
        )}
      </SectionCard>
    </View>
  );
}
