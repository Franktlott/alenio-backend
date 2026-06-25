import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDevelopmentGoals,
  fetchOneOnOneMeetings,
  type DevelopmentGoal,
} from "../lib/api";
import { formatTaskStreakValue } from "../lib/member-stats-display";

type Props = {
  teamId: string;
  memberUserId: string;
  roleLabel: string;
  email?: string | null;
  streak?: number;
  overdueTasks?: number;
};

function formatDateOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
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

export function ProfileOverviewTab({
  teamId,
  memberUserId,
  roleLabel,
  email,
  streak,
  overdueTasks,
}: Props) {
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

  const kpis = [
    { label: "Active goals", value: loading ? "—" : String(activeGoals.length) },
    {
      label: "Last check-in",
      value: loading ? "—" : lastOneOnOneDate ? formatDateOnly(lastOneOnOneDate) : "None",
    },
    {
      label: "Days since check-in",
      value: loading ? "—" : lastOneOnOneDate ? daysSinceText(daysSinceOneOnOne ?? 0) : "—",
    },
    { label: "Total check-ins", value: loading ? "—" : String(oneOnOneCount) },
    ...(streak != null && streak > 0
      ? [{ label: "Task streak", value: formatTaskStreakValue(streak, true) }]
      : []),
    ...(overdueTasks != null && overdueTasks > 0
      ? [{ label: "Overdue", value: String(overdueTasks), tone: "warning" as const }]
      : []),
  ];

  const profileMeta = [roleLabel, email].filter(Boolean).join(" · ");

  return (
    <div className="enterprise-profile-overview">
      <section className="enterprise-overview-snapshot">
        <header className="enterprise-overview-snapshot-head">
          <div>
            <p className="enterprise-overview-kicker">Overview</p>
            <h3 className="enterprise-overview-title">Member snapshot</h3>
          </div>
          {profileMeta ? <p className="enterprise-overview-snapshot-meta">{profileMeta}</p> : null}
        </header>

        <div className="enterprise-overview-kpi-row">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className={`enterprise-overview-kpi${kpi.tone === "warning" ? " enterprise-overview-kpi--warning" : ""}`}
            >
              <span className="enterprise-overview-kpi-label">{kpi.label}</span>
              <span className="enterprise-overview-kpi-value">{kpi.value}</span>
            </div>
          ))}
        </div>

        {err ? <p className="enterprise-form-error enterprise-overview-snapshot-error" role="alert">{err}</p> : null}

        <div className="enterprise-overview-snapshot-section">
          <div className="enterprise-overview-snapshot-section-head">
            <h4>Active development goals</h4>
            {!loading && activeGoals.length > 0 ? (
              <span className="enterprise-overview-snapshot-count">{activeGoals.length}</span>
            ) : null}
          </div>

          {loading ? (
            <p className="enterprise-overview-inline-empty">Loading…</p>
          ) : activeGoals.length === 0 ? (
            <p className="enterprise-overview-inline-empty">No active development goals.</p>
          ) : (
            <div className="enterprise-overview-goals-scroll">
              <table className="enterprise-overview-goals-table">
                <thead>
                  <tr>
                    <th scope="col">Goal</th>
                    <th scope="col">Last updated</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeGoals.map((goal) => (
                    <tr key={goal.id}>
                      <td className="enterprise-overview-goals-table-goal">{goal.skill}</td>
                      <td>{formatUpdatedWithDays(lastUpdatedAt(goal))}</td>
                      <td>
                        <span className="enterprise-overview-goal-pill">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
