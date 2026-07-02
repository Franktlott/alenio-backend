import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDevelopmentGoals,
  fetchOneOnOneMeetings,
  type DevelopmentGoal,
} from "../lib/api";
import {
  DEFAULT_WORKPLACE_STANDARDS,
  formatCheckInFrequencySummary,
  frequencyToDays,
  memberStandardsBadges,
  standardsBadgeClassName,
  type MemberStandardsCompliance,
  type WorkplaceStandards,
} from "../lib/workplace-standards";
import { StandardsStatusKey } from "./StandardsStatusKey";
import { oneOnOneDisplayDateMs, oneOnOnePublishedAt } from "../lib/one-on-one-dates";

type Props = {
  teamId: string;
  memberUserId: string;
  roleLabel: string;
  email?: string | null;
  isSelf?: boolean;
  canManageStandards?: boolean;
  canCreateDevGoal?: boolean;
  workplaceStandards?: WorkplaceStandards;
  standardsCompliance?: MemberStandardsCompliance;
  onManageStandards?: () => void;
  onOpenGrowthTab?: () => void;
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
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatUpdatedWithDays(iso: string): string {
  const days = daysSinceDate(iso);
  const ago = days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return `${formatDateOnly(iso)} · ${ago}`;
}

function IconTarget() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function checkInChipClass(status: MemberStandardsCompliance["checkInStatus"]): string {
  if (status === "overdue") return "enterprise-overview-status-chip enterprise-overview-status-chip--danger";
  if (status === "due_soon") return "enterprise-overview-status-chip enterprise-overview-status-chip--warn";
  if (status === "on_track") return "enterprise-overview-status-chip enterprise-overview-status-chip--success";
  return "enterprise-overview-status-chip enterprise-overview-status-chip--muted";
}

export function ProfileOverviewTab({
  teamId,
  memberUserId,
  roleLabel,
  email,
  isSelf = false,
  canManageStandards = false,
  canCreateDevGoal = false,
  workplaceStandards,
  standardsCompliance,
  onManageStandards,
  onOpenGrowthTab,
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

  const requiredGoals = standards.goalsRequired ? standards.minimumActiveGoals : 0;
  const goalsBelowRequired = standards.goalsRequired && activeGoals.length < requiredGoals;
  const checkInFrequencyDays = standards.checkInRequired
    ? frequencyToDays(standards.checkInFrequencyValue, standards.checkInFrequencyUnit)
    : null;

  const profileMeta = [roleLabel, email].filter(Boolean).join(" · ");
  const goalsTitle = isSelf ? "Your active goals" : "Active goals";
  const memberBadges = standardsCompliance
    ? memberStandardsBadges(standardsCompliance, daysSinceOneOnOne)
    : [];

  const goalsGuidance =
    standardsCompliance && standardsCompliance.missingGoals > 0
      ? `Add ${standardsCompliance.missingGoals} active development goal${standardsCompliance.missingGoals === 1 ? "" : "s"} to meet ${isSelf ? "your" : "this"} workplace standard.`
      : null;

  return (
    <div className="enterprise-profile-overview">
      <section className="enterprise-overview-panel">
        <header className="enterprise-overview-panel-head">
          <div>
            <p className="enterprise-overview-kicker enterprise-overview-kicker--accent">Overview</p>
            <h3 className="enterprise-overview-panel-title">Member snapshot</h3>
          </div>
          {profileMeta ? <p className="enterprise-overview-panel-meta">{profileMeta}</p> : null}
        </header>

        <div className="enterprise-overview-metric-grid">
          <article className="enterprise-overview-metric-card">
            <span className="enterprise-overview-metric-icon" aria-hidden>
              <IconTarget />
            </span>
            <div className="enterprise-overview-metric-copy">
              <span className="enterprise-overview-metric-label">Active goals</span>
              {loading ? (
                <strong className="enterprise-overview-metric-value">—</strong>
              ) : standards.goalsRequired ? (
                <strong className="enterprise-overview-metric-value">
                  <span className={goalsBelowRequired ? "enterprise-overview-metric-value--alert" : undefined}>
                    {activeGoals.length}
                  </span>
                  <span className="enterprise-overview-metric-value-muted">
                    {" "}
                    of {requiredGoals} required
                  </span>
                </strong>
              ) : (
                <strong className="enterprise-overview-metric-value">{activeGoals.length}</strong>
              )}
            </div>
          </article>

          <article className="enterprise-overview-metric-card">
            <span className="enterprise-overview-metric-icon" aria-hidden>
              <IconCalendar />
            </span>
            <div className="enterprise-overview-metric-copy">
              <span className="enterprise-overview-metric-label">Last check-in</span>
              {loading ? (
                <strong className="enterprise-overview-metric-value">—</strong>
              ) : lastOneOnOneDate ? (
                <>
                  <strong className="enterprise-overview-metric-value">{formatDateOnly(lastOneOnOneDate)}</strong>
                  <span className="enterprise-overview-metric-sub">{daysSinceText(daysSinceOneOnOne ?? 0)}</span>
                </>
              ) : (
                <>
                  <strong className="enterprise-overview-metric-value">None</strong>
                  <span className="enterprise-overview-metric-sub">No initial check-in yet</span>
                </>
              )}
            </div>
          </article>

          <article className="enterprise-overview-metric-card">
            <span className="enterprise-overview-metric-icon" aria-hidden>
              <IconClock />
            </span>
            <div className="enterprise-overview-metric-copy">
              <span className="enterprise-overview-metric-label">Days since check-in</span>
              {loading ? (
                <strong className="enterprise-overview-metric-value">—</strong>
              ) : (
                <>
                  <strong className="enterprise-overview-metric-value">
                    {lastOneOnOneDate ? `${daysSinceOneOnOne} days` : "—"}
                  </strong>
                  {checkInFrequencyDays ? (
                    <span className="enterprise-overview-metric-sub">of {checkInFrequencyDays} day requirement</span>
                  ) : (
                    <span className="enterprise-overview-metric-sub">Check-ins not required</span>
                  )}
                </>
              )}
            </div>
          </article>

          <article className="enterprise-overview-metric-card">
            <span className="enterprise-overview-metric-icon" aria-hidden>
              <IconList />
            </span>
            <div className="enterprise-overview-metric-copy">
              <span className="enterprise-overview-metric-label">Total check-ins</span>
              <strong className="enterprise-overview-metric-value">{loading ? "—" : String(oneOnOneCount)}</strong>
              <span className="enterprise-overview-metric-sub">All time</span>
            </div>
          </article>
        </div>

        {err ? (
          <p className="enterprise-form-error enterprise-overview-panel-error" role="alert">
            {err}
          </p>
        ) : null}
      </section>

      <section className="enterprise-overview-panel enterprise-overview-standards-panel">
        <header className="enterprise-overview-panel-head enterprise-overview-standards-panel-head">
          <div>
            <p className="enterprise-overview-kicker">Workplace</p>
            <h3 className="enterprise-overview-panel-title enterprise-overview-panel-title--with-key">
              Standards status
              <StandardsStatusKey />
            </h3>
          </div>
          {canManageStandards && onManageStandards ? (
            <button type="button" className="enterprise-overview-manage-standards-btn" onClick={onManageStandards}>
              Manage
            </button>
          ) : null}
        </header>

        <div className="enterprise-overview-standards-columns">
          <div className="enterprise-overview-standards-column">
            <span className="enterprise-overview-standards-column-label">Check-in requirement</span>
            <strong className="enterprise-overview-standards-column-value">
              {standards.checkInRequired ? formatCheckInFrequencySummary(standards) : "Not required"}
            </strong>
            {standardsCompliance && standards.checkInRequired ? (
              <div className="enterprise-overview-standards-chips">
                <span className={checkInChipClass(standardsCompliance.checkInStatus)}>
                  {standardsCompliance.checkInActionText}
                </span>
              </div>
            ) : null}
          </div>

          <div className="enterprise-overview-standards-column">
            <span className="enterprise-overview-standards-column-label">Goal requirement</span>
            <strong className="enterprise-overview-standards-column-value">
              {standards.goalsRequired
                ? `${standards.minimumActiveGoals} active goal${standards.minimumActiveGoals === 1 ? "" : "s"}`
                : "Not required"}
            </strong>
            {standardsCompliance && standards.goalsRequired ? (
              <div className="enterprise-overview-standards-chips">
                <span
                  className={
                    standardsCompliance.goalsStatus === "missing_goals"
                      ? "enterprise-overview-status-chip enterprise-overview-status-chip--danger"
                      : "enterprise-overview-status-chip enterprise-overview-status-chip--success"
                  }
                >
                  {standardsCompliance.goalsActionText}
                </span>
              </div>
            ) : null}
          </div>

          <div className="enterprise-overview-standards-column enterprise-overview-standards-column--status">
            <span className="enterprise-overview-standards-column-label">Member status</span>
            {standardsCompliance ? (
              <>
                <div className="enterprise-overview-standards-badges">
                  {memberBadges.map((badge) => (
                    <span key={badge.key} className={standardsBadgeClassName(badge.variant)} title={badge.title}>
                      {badge.label}
                    </span>
                  ))}
                </div>
                {goalsGuidance ? (
                  <p className="enterprise-overview-standards-guidance">{goalsGuidance}</p>
                ) : null}
                {canCreateDevGoal && goalsGuidance && onOpenGrowthTab ? (
                  <button type="button" className="enterprise-overview-standards-action-link" onClick={onOpenGrowthTab}>
                    + Add Goal
                  </button>
                ) : null}
              </>
            ) : (
              <strong className="enterprise-overview-standards-column-value">—</strong>
            )}
          </div>
        </div>
      </section>

      <section className="enterprise-overview-panel enterprise-overview-goals-panel">
        <header className="enterprise-overview-panel-head enterprise-overview-goals-panel-head">
          <div>
            <h3 className="enterprise-overview-panel-title">{goalsTitle}</h3>
          </div>
          {onOpenGrowthTab ? (
            <button type="button" className="enterprise-overview-view-goals-btn" onClick={onOpenGrowthTab}>
              View all
            </button>
          ) : null}
        </header>

        {loading ? (
          <p className="enterprise-overview-goals-empty">Loading…</p>
        ) : activeGoals.length === 0 ? (
          <div className="enterprise-overview-goals-empty-state">
            <p>
              {isSelf
                ? "You don't have any active development goals. Set a goal to grow and achieve more."
                : "No active development goals for this member."}
            </p>
            {canCreateDevGoal && isSelf && onOpenGrowthTab ? (
              <button type="button" className="enterprise-overview-standards-action-link" onClick={onOpenGrowthTab}>
                + Create your first goal
              </button>
            ) : null}
          </div>
        ) : (
          <div className="enterprise-overview-goals-list">
            <div className="enterprise-overview-goals-table-wrap">
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
          </div>
        )}
      </section>
    </div>
  );
}
