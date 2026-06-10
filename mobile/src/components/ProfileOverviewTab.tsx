import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import {
  fetchDevelopmentGoals,
  fetchOneOnOneMeetings,
  type DevelopmentGoal,
} from "@/lib/member-profile-api";

type Props = {
  teamId: string;
  memberUserId: string;
  streak?: number;
  overdueTasks?: number;
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

function KpiCard({
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
        minWidth: "45%",
        backgroundColor: warning ? "#FEF2F2" : "#F8FAFC",
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: warning ? "#FECACA" : "#E2E8F0",
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: warning ? "#DC2626" : "#0F172A",
          marginTop: 4,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function ProfileOverviewTab({ teamId, memberUserId, streak, overdueTasks }: Props) {
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
        .filter((goal) => goal.status !== "closed")
        .sort(
          (a, b) => new Date(lastUpdatedAt(b)).getTime() - new Date(lastUpdatedAt(a)).getTime(),
        );
      setActiveGoals(active);
      setOneOnOneCount(meetings.length);

      const latestMeeting = [...meetings].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
      setLastOneOnOneDate(latestMeeting?.createdAt ?? null);
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

  if (loading) {
    return (
      <View style={{ paddingVertical: 32, alignItems: "center" }}>
        <ActivityIndicator color="#4361EE" />
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase" }}>
          Overview
        </Text>
        <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A", marginTop: 2 }}>
          Member snapshot
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <KpiCard label="Active goals" value={String(activeGoals.length)} />
        <KpiCard
          label="Last 1:1"
          value={lastOneOnOneDate ? formatDateOnly(lastOneOnOneDate) : "None"}
        />
        <KpiCard
          label="Days since 1:1"
          value={lastOneOnOneDate ? daysSinceText(daysSinceOneOnOne ?? 0) : "—"}
        />
        <KpiCard label="Total 1:1s" value={String(oneOnOneCount)} />
        {streak != null && streak > 0 ? <KpiCard label="Streak" value={`${streak}d`} /> : null}
        {overdueTasks != null && overdueTasks > 0 ? (
          <KpiCard label="Overdue" value={String(overdueTasks)} warning />
        ) : null}
      </View>

      {err ? (
        <Text style={{ fontSize: 13, color: "#DC2626" }}>{err}</Text>
      ) : null}

      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>Active development goals</Text>
          {activeGoals.length > 0 ? (
            <View style={{ backgroundColor: "#EEF2FF", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#4361EE" }}>{activeGoals.length}</Text>
            </View>
          ) : null}
        </View>

        {activeGoals.length === 0 ? (
          <Text style={{ fontSize: 13, color: "#94A3B8" }}>No active development goals.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {activeGoals.map((goal) => (
              <View
                key={goal.id}
                style={{
                  backgroundColor: "white",
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>{goal.skill}</Text>
                <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                  {formatUpdatedWithDays(lastUpdatedAt(goal))}
                </Text>
                <View
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 8,
                    backgroundColor: "#DCFCE7",
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#166534" }}>Active</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
