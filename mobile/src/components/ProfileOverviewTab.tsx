import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, ScrollView } from "react-native";
import {
  Target,
  Calendar,
  Clock,
  Flag,
} from "lucide-react-native";
import {
  fetchDevelopmentGoals,
  fetchOneOnOneMeetings,
  type DevelopmentGoal,
  type OneOnOneMeeting,
} from "@/lib/member-profile-api";
import {
  oneOnOneDisplayDateMs,
  oneOnOnePublishedAt,
  latestPublishedCheckInForStandards,
} from "@/lib/one-on-one-dates";
import { calendarDaysSinceDate } from "@/lib/member-stats-display";
import {
  DEFAULT_WORKPLACE_STANDARDS,
  formatCheckInFrequencySummary,
  frequencyToDays,
  type MemberStandardsCompliance,
  type WorkplaceStandards,
} from "@/lib/workplace-standards";
import { StandardsStatusKey } from "@/components/StandardsStatusKey";

type Props = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  streak?: number;
  overdueFollowUpTasks?: number;
  workplaceStandards?: WorkplaceStandards;
  standardsCompliance?: MemberStandardsCompliance;
  daysSinceLastCheckIn?: number | null;
  canStartCheckIn?: boolean;
  canCreateGoal?: boolean;
  onStartCheckIn?: () => void;
  onCreateGoal?: () => void;
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

function nextDueLabel(
  standards: WorkplaceStandards,
  daysSince: number | null,
  compliance: MemberStandardsCompliance | undefined,
): string {
  if (!standards.checkInRequired) return "—";
  if (daysSince == null) return "Today";
  const frequencyDays = frequencyToDays(standards.checkInFrequencyValue, standards.checkInFrequencyUnit);
  const remaining = frequencyDays - daysSince;
  if (compliance?.checkInStatus === "overdue" || remaining <= 0) return "Today";
  if (remaining === 1) return "Tomorrow";
  return `In ${remaining} days`;
}

function SectionCard({
  title,
  trailing,
  children,
  bodyStyle,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  bodyStyle?: object;
}) {
  return (
    <View
      style={{
        backgroundColor: "white",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E8ECFA",
        overflow: "hidden",
        shadowColor: "#0F172A",
        shadowOpacity: 0.03,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 10,
          paddingTop: 8,
          paddingBottom: 5,
        }}
      >
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: "#0F172A", flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        {trailing}
      </View>
      <View style={[{ paddingHorizontal: 10, paddingBottom: 8 }, bodyStyle]}>{children}</View>
    </View>
  );
}

function SnapshotTile({
  icon,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 5,
            backgroundColor: iconBg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
        <Text style={{ fontSize: 9, fontWeight: "600", color: "#94A3B8", flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 11.5, fontWeight: "800", color: "#0F172A" }} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={{ fontSize: 9, color: "#94A3B8", marginTop: -1 }} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

export function ProfileOverviewTab({
  teamId,
  memberUserId,
  memberName,
  workplaceStandards,
  standardsCompliance,
  daysSinceLastCheckIn,
}: Props) {
  const standards = workplaceStandards ?? DEFAULT_WORKPLACE_STANDARDS;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeGoals, setActiveGoals] = useState<DevelopmentGoal[]>([]);
  const [meetings, setMeetings] = useState<OneOnOneMeeting[]>([]);

  const firstName = memberName.trim().split(/\s+/)[0] || memberName || "this teammate";

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [goals, meetingList] = await Promise.all([
        fetchDevelopmentGoals(teamId, memberUserId),
        fetchOneOnOneMeetings(teamId, memberUserId),
      ]);
      const active = goals
        .filter((goal) => goal.status === "active")
        .sort(
          (a, b) => new Date(lastUpdatedAt(b)).getTime() - new Date(lastUpdatedAt(a)).getTime(),
        );
      setActiveGoals(active);
      setMeetings(meetingList);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load overview.");
      setActiveGoals([]);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [memberUserId, teamId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const publishedMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.status !== "draft"),
    [meetings],
  );

  const recentCheckIns = useMemo(() => {
    return [...meetings]
      .sort((a, b) => oneOnOneDisplayDateMs(b) - oneOnOneDisplayDateMs(a))
      .slice(0, 4)
      .map((meeting) => ({
        id: meeting.id,
        name: meeting.templateTitle?.trim() || "Check-in",
      }));
  }, [meetings]);

  const latestMeeting = useMemo(
    () => latestPublishedCheckInForStandards(meetings, standards),
    [meetings, standards],
  );
  const lastOneOnOneDate = latestMeeting ? oneOnOnePublishedAt(latestMeeting) : null;

  const daysSinceOneOnOne = useMemo(() => {
    if (daysSinceLastCheckIn != null) return daysSinceLastCheckIn;
    return lastOneOnOneDate ? daysSinceDate(lastOneOnOneDate) : null;
  }, [daysSinceLastCheckIn, lastOneOnOneDate]);

  const nextDue = nextDueLabel(standards, daysSinceOneOnOne, standardsCompliance);
  const goalsSummary = standards.goalsRequired
    ? `${standards.minimumActiveGoals} required`
    : "Optional";
  if (loading && activeGoals.length === 0 && meetings.length === 0 && !err) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#4361EE" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
      showsVerticalScrollIndicator={false}
    >
      {err ? (
        <Text style={{ fontSize: 11, color: "#DC2626", paddingHorizontal: 2 }}>{err}</Text>
      ) : null}

      <SectionCard title="Performance snapshot">
        <View style={{ flexDirection: "row", gap: 7 }}>
          <SnapshotTile
            icon={<Target size={9} color="#7C3AED" strokeWidth={2.4} />}
            iconBg="#F3E8FF"
            label="Goals"
            value={`${activeGoals.length} Active`}
          />
          <SnapshotTile
            icon={<Clock size={9} color="#EA580C" strokeWidth={2.4} />}
            iconBg="#FFEDD5"
            label="Check-in status"
            value={
              lastOneOnOneDate
                ? daysSinceOneOnOne === 0
                  ? "Today"
                  : `${daysSinceOneOnOne ?? 0} days since`
                : "Never"
            }
            sub={lastOneOnOneDate ? `Last ${formatDateOnly(lastOneOnOneDate)}` : "No check-in yet"}
          />
        </View>
      </SectionCard>

      <SectionCard
        title="Development standards"
        trailing={<StandardsStatusKey iconSize={13} />}
        bodyStyle={{ paddingTop: 0 }}
      >
        <View style={{ flexDirection: "row", gap: 8, alignItems: "stretch" }}>
          <View style={{ flex: 1.15, minWidth: 0, paddingTop: 1 }}>
            {recentCheckIns.length === 0 ? (
              <Text style={{ fontSize: 12, color: "#94A3B8", lineHeight: 16 }}>
                No check-ins yet
              </Text>
            ) : (
              <View>
                {recentCheckIns.map((item, index) => {
                  const isLatest = index === 0;
                  const isLast = index === recentCheckIns.length - 1;
                  return (
                    <View
                      key={item.id}
                      style={{ flexDirection: "row", alignItems: "flex-start", minHeight: isLast ? 18 : 26 }}
                    >
                      <View style={{ width: 14, alignItems: "center", marginRight: 6 }}>
                        <View
                          style={{
                            width: isLatest ? 8 : 6,
                            height: isLatest ? 8 : 6,
                            borderRadius: 4,
                            marginTop: 3,
                            backgroundColor: isLatest ? "#6366F1" : "#CBD5E1",
                            borderWidth: isLatest ? 0 : 1.5,
                            borderColor: "#E2E8F0",
                          }}
                        />
                        {!isLast ? (
                          <View
                            style={{
                              width: 1.5,
                              flex: 1,
                              minHeight: 10,
                              backgroundColor: "#E2E8F0",
                              marginTop: 2,
                            }}
                          />
                        ) : null}
                      </View>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 12,
                          fontWeight: isLatest ? "700" : "500",
                          color: isLatest ? "#4F46E5" : "#94A3B8",
                          lineHeight: 16,
                          paddingTop: 0,
                        }}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: "#F8FAFC",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#EEF2F6",
              paddingHorizontal: 8,
              paddingVertical: 6,
              gap: 5,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
              <Calendar size={12} color="#94A3B8" strokeWidth={2} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, color: "#94A3B8", fontWeight: "500" }}>Frequency</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A", marginTop: 0 }} numberOfLines={1}>
                  {formatCheckInFrequencySummary(standards)}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
              <Flag size={12} color="#94A3B8" strokeWidth={2} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, color: "#94A3B8", fontWeight: "500" }}>Goals</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A", marginTop: 0 }} numberOfLines={1}>
                  {goalsSummary}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
              <Clock size={12} color="#94A3B8" strokeWidth={2} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, color: "#94A3B8", fontWeight: "500" }}>Next due</Text>
                <Text style={{ fontSize: 12, fontWeight: "800", color: "#0F172A", marginTop: 0 }} numberOfLines={1}>
                  {nextDue}
                </Text>
              </View>
            </View>
          </View>
        </View>

      </SectionCard>

      <SectionCard title="Development goals">
        {activeGoals.length === 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 2, gap: 8 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: "#EEF2FF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Target size={14} color="#6366F1" />
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 11,
                color: "#64748B",
                lineHeight: 15,
              }}
              numberOfLines={2}
            >
              No active development goals. Create a goal to help {firstName} grow.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 0 }}>
            {activeGoals.slice(0, 3).map((goal, index) => (
              <View
                key={goal.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  paddingVertical: 7,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: "#F1F5F9",
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    backgroundColor: "#EEF2FF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Target size={12} color="#4361EE" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
                    {goal.skill}
                  </Text>
                  <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 0 }} numberOfLines={1}>
                    Updated {formatDateOnly(lastUpdatedAt(goal))}
                  </Text>
                </View>
              </View>
            ))}
            {activeGoals.length > 3 ? (
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                +{activeGoals.length - 3} more on Growth
              </Text>
            ) : null}
          </View>
        )}
      </SectionCard>
    </ScrollView>
  );
}
