import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDevelopmentGoals,
  fetchOneOnOneMeetings,
  type DevelopmentGoal,
} from "../lib/api";

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

      const latestMeeting = [...meetings].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
      setLastOneOnOneDate(latestMeeting?.createdAt ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load overview.");
      setActiveGoals([]);
      setLastOneOnOneDate(null);
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

  return (
    <div className="enterprise-profile-overview">
      <section className="enterprise-team-profile-section">
        <h3 className="enterprise-team-profile-section-title">At a glance</h3>
        <dl className="enterprise-team-profile-facts">
          <div>
            <dt>Role</dt>
            <dd>{roleLabel}</dd>
          </div>
          {email ? (
            <div>
              <dt>Email</dt>
              <dd>{email}</dd>
            </div>
          ) : null}
          {streak != null && streak > 0 ? (
            <div>
              <dt>Streak</dt>
              <dd>🔥 {streak} days</dd>
            </div>
          ) : null}
          {overdueTasks != null && overdueTasks > 0 ? (
            <div>
              <dt>Overdue tasks</dt>
              <dd className="enterprise-stat-overdue">{overdueTasks}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}

      <section className="enterprise-team-profile-section enterprise-profile-overview-section">
        <h3 className="enterprise-team-profile-section-title">Active development goals</h3>
        {loading ? (
          <p className="enterprise-muted">Loading…</p>
        ) : activeGoals.length === 0 ? (
          <p className="enterprise-muted">No active development goals.</p>
        ) : (
          <ul className="enterprise-profile-overview-goals">
            {activeGoals.map((goal) => (
              <li key={goal.id} className="enterprise-profile-overview-goal">
                <span className="enterprise-profile-overview-goal-title">{goal.skill}</span>
                <span className="enterprise-profile-overview-goal-date">
                  Updated {formatDateOnly(lastUpdatedAt(goal))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="enterprise-team-profile-section enterprise-profile-overview-section">
        <h3 className="enterprise-team-profile-section-title">1:1 check-ins</h3>
        {loading ? (
          <p className="enterprise-muted">Loading…</p>
        ) : lastOneOnOneDate ? (
          <dl className="enterprise-profile-overview-oneone">
            <div>
              <dt>Last 1:1</dt>
              <dd>{formatDateOnly(lastOneOnOneDate)}</dd>
            </div>
            <div>
              <dt>Days since last 1:1</dt>
              <dd>{daysSinceText(daysSinceOneOnOne ?? 0)}</dd>
            </div>
          </dl>
        ) : (
          <p className="enterprise-muted">No 1:1 meetings yet.</p>
        )}
      </section>
    </div>
  );
}
