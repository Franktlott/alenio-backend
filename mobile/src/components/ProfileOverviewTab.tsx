import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import {
  fetchDevelopmentGoals,
  fetchOneOnOneMeetings,
  type DevelopmentGoal,
} from "@/lib/member-profile-api";
import { oneOnOneDisplayDateMs, oneOnOnePublishedAt } from "@/lib/one-on-one-dates";

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
  const then = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  return Math.max(
    0,
    Math.floor((startOfToday.getTime() - startOfThen.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function daysSinceText(days: number): string {
  if (days === 1) return "1 day";
  return `${days} days`;
}

function formatUpdatedWithDays(iso: string): string {
  const days = daysSinceDate(iso);
  return `${formatDateOnly(iso)} · ${daysSinceText(days)}`;
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
    <View
      style={{
        flex: 1,
        minWidth: "30%",
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: warning ? "#FEF2F2" : "white",
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontWeight: "700",
          color: "#94A3B8",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: warning ? "#B91C1C" : "#0F172A",
          marginTop: 2,
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

      const latestMeeting = [...publishedMeetings].sort(
        (a, b) => oneOnOneDisplayDateMs(b) - oneOnOneDisplayDateMs(a),
      )[0];
      setLastOneOnOneDate(latestMeeting ? oneOnOnePublishedAt(latestMeeting) : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load overview.");
      setActiveGoals([]);
      setLastOneOnOneDate(null);
      setOneOnOneCount(0);
    } finally {
      setLoading(false);
    }
  }, [memberUserId, teamId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const daysSinceOneOnOne = useMemo(
    () => (lastOneOnOneDate ? daysSinceDate(lastOneOnOneDate) : null),
    [lastOneOnOneDate],
  );

  const kpis = [
    { label: "Active goals", value: loading ? "—" : String(activeGoals.length) },
    {
      label: "Last check-in",
      value: loading ? "—" : lastOneOnOneDate ? formatDateOnly(lastOneOnOneDate) : "None",
    },
    {
      label: "Days since",
      value: loading ? "—" : lastOneOnOneDate ? daysSinceText(daysSinceOneOnOne ?? 0) : "—",
    },
    { label: "Check-ins", value: loading ? "—" : String(oneOnOneCount) },
    ...(streak != null && streak > 0 ? [{ label: "Streak", value: `${streak}d` }] : []),
    ...(overdueFollowUpTasks != null && overdueFollowUpTasks > 0
      ? [{ label: "Overdue", value: String(overdueFollowUpTasks), warning: true as const }]
      : []),
  ];

  if (loading && activeGoals.length === 0 && !err) {
    return (
      <View
        style={{
          backgroundColor: "white",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E0E7FF",
          paddingVertical: 28,
          alignItems: "center",
        }}
      >
        <ActivityIndicator color="#4361EE" />
      </View>
    );
  }

  return (
    <View
      style={{
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
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#E8ECFA",
          backgroundColor: "#FAFBFF",
        }}
      >
        <Text style={{ fontSize: 9, fontWeight: "700", color: "#64748B", letterSpacing: 1.2, textTransform: "uppercase" }}>
          Overview
        </Text>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", marginTop: 2 }}>
          Member snapshot
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          backgroundColor: "#E8ECFA",
          gap: 1,
        }}
      >
        {kpis.map((kpi) => (
          <KpiCell key={kpi.label} label={kpi.label} value={kpi.value} warning={"warning" in kpi ? kpi.warning : false} />
        ))}
      </View>

      {err ? (
        <Text style={{ fontSize: 12, color: "#DC2626", paddingHorizontal: 14, paddingTop: 10 }}>{err}</Text>
      ) : null}

      <View
        style={{
          marginHorizontal: 14,
          marginTop: 10,
          marginBottom: 4,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#E8EDF3",
          backgroundColor: "#FFFFFF",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Text style={{ fontSize: 9, fontWeight: "700", color: "#64748B", letterSpacing: 1.1, textTransform: "uppercase" }}>
            Standards Status
          </Text>
          <StandardsStatusKey />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
          <View style={{ minWidth: "40%" }}>
            <Text style={{ fontSize: 9, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase" }}>Check-in</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", marginTop: 2 }}>
              {standards.checkInRequired ? formatCheckInFrequencySummary(standards) : "Not required"}
            </Text>
          </View>
          <View style={{ minWidth: "40%" }}>
            <Text style={{ fontSize: 9, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase" }}>Goals</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", marginTop: 2 }}>
              {standards.goalsRequired
                ? `${standards.minimumActiveGoals} active goal${standards.minimumActiveGoals === 1 ? "" : "s"}`
                : "Not required"}
            </Text>
          </View>
        </View>
        {standardsCompliance ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {memberStandardsBadges(standardsCompliance).map((badge) => {
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
            <View style={{ marginTop: 8, gap: 4 }}>
              {standardsCompliance.checkInStatus !== "not_required" ? (
                <Text style={{ fontSize: 12, color: "#475569" }}>{standardsCompliance.checkInActionText}</Text>
              ) : null}
              {standardsCompliance.goalsStatus !== "not_required" ? (
                <Text style={{ fontSize: 12, color: "#475569" }}>{standardsCompliance.goalsActionText}</Text>
              ) : null}
            </View>
          </>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748B", letterSpacing: 0.6, textTransform: "uppercase" }}>
            Active development goals
          </Text>
          {activeGoals.length > 0 ? (
            <View style={{ backgroundColor: "#EEF2FF", borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#4361EE" }}>{activeGoals.length}</Text>
            </View>
          ) : null}
        </View>

        {activeGoals.length === 0 ? (
          <Text style={{ fontSize: 12, color: "#94A3B8" }}>No active development goals.</Text>
        ) : (
          <View style={{ gap: 0 }}>
            {activeGoals.map((goal, index) => (
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
          </View>
        )}
      </View>
    </View>
  );
}
