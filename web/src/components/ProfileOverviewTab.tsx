import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDevelopmentGoals,
  fetchOneOnOneMeetings,
  fetchTeamRecognitions,
  type DevelopmentGoal,
  type OneOnOneMeeting,
  type RecognitionItem,
} from "../lib/api";
import { calendarDaysSinceDate } from "../lib/member-stats-display";
import {
  latestPublishedCheckInForStandards,
  oneOnOnePublishedAt,
} from "../lib/one-on-one-dates";
import {
  DEFAULT_WORKPLACE_STANDARDS,
  frequencyToDays,
  type MemberStandardsCompliance,
  type WorkplaceStandards,
} from "../lib/workplace-standards";

type Props = {
  teamId: string;
  memberUserId: string;
  isSelf?: boolean;
  canCreateDevGoal?: boolean;
  workplaceStandards?: WorkplaceStandards;
  standardsCompliance?: MemberStandardsCompliance;
  daysSinceLastCheckIn?: number | null;
  onOpenGrowthTab?: () => void;
};

function formatRelativeShort(iso: string): string {
  const days = calendarDaysSinceDate(iso);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
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

function nextCheckInInfo(
  standards: WorkplaceStandards,
  daysSince: number | null | undefined,
  compliance: MemberStandardsCompliance | undefined,
): { value: string; hint: string; remaining: number | null; tone: "ok" | "warn" | "danger" | "muted" } {
  if (!standards.checkInRequired) {
    return { value: "—", hint: "Not required", remaining: null, tone: "muted" };
  }
  if (daysSince == null) {
    return { value: "Due", hint: "No check-in yet", remaining: 0, tone: "danger" };
  }
  const frequencyDays = frequencyToDays(standards.checkInFrequencyValue, standards.checkInFrequencyUnit);
  const remaining = frequencyDays - daysSince;
  if (compliance?.checkInStatus === "overdue" || remaining <= 0) {
    return { value: "Overdue", hint: `${daysSince}d since last`, remaining: 0, tone: "danger" };
  }
  if (compliance?.checkInStatus === "due_soon" || remaining <= Math.ceil(frequencyDays * 0.2)) {
    return {
      value: remaining === 1 ? "1 day" : `${remaining} days`,
      hint: "Due soon",
      remaining,
      tone: "warn",
    };
  }
  return {
    value: remaining === 1 ? "1 day" : `${remaining} days`,
    hint: "Until next check-in",
    remaining,
    tone: "ok",
  };
}

function IconPlus() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5A2.5 2.5 0 0 0 7 8.5M17 6h2.5A2.5 2.5 0 0 1 17 8.5" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 5h16v11H8l-4 4V5Z" />
    </svg>
  );
}

function IconMountain() {
  return (
    <svg width="40" height="28" viewBox="0 0 64 48" fill="none" aria-hidden>
      <path d="M8 40 24 16l10 14 8-10 14 20H8Z" fill="#e8eef5" stroke="#b8c5d6" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M24 16 30 24l4-3 4 6" stroke="#94a3b8" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="48" cy="12" r="4" fill="#fde68a" stroke="#f59e0b" strokeWidth="1" />
    </svg>
  );
}

function HealthRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <div className="enterprise-mo-health-ring" aria-label={`Health score ${clamped}`}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e8eef5" strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={clamped >= 80 ? "#16a34a" : clamped >= 50 ? "#2563eb" : "#f59e0b"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <div className="enterprise-mo-health-ring-label">
        <strong>{clamped}</strong>
        <span>Health</span>
      </div>
    </div>
  );
}

export function ProfileOverviewTab({
  teamId,
  memberUserId,
  isSelf = false,
  canCreateDevGoal = false,
  workplaceStandards,
  standardsCompliance,
  daysSinceLastCheckIn,
  onOpenGrowthTab,
}: Props) {
  const standards = workplaceStandards ?? DEFAULT_WORKPLACE_STANDARDS;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeGoals, setActiveGoals] = useState<DevelopmentGoal[]>([]);
  const [meetings, setMeetings] = useState<OneOnOneMeeting[]>([]);
  const [recognitions, setRecognitions] = useState<RecognitionItem[]>([]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [goals, meetingList, recognitionSummary] = await Promise.all([
        fetchDevelopmentGoals(teamId, memberUserId),
        fetchOneOnOneMeetings(teamId, memberUserId),
        fetchTeamRecognitions(teamId, { range: "all", limit: 300 }).catch(() => null),
      ]);
      setActiveGoals(goals.filter((g) => g.status === "active"));
      setMeetings(meetingList);
      setRecognitions(recognitionSummary?.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load overview.");
      setActiveGoals([]);
      setMeetings([]);
      setRecognitions([]);
    } finally {
      setLoading(false);
    }
  }, [memberUserId, teamId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const publishedMeetings = useMemo(
    () => meetings.filter((m) => m.status !== "draft"),
    [meetings],
  );

  const latestMeeting = useMemo(
    () => latestPublishedCheckInForStandards(meetings, standards),
    [meetings, standards],
  );

  const lastCheckInIso = latestMeeting ? oneOnOnePublishedAt(latestMeeting) : null;
  const daysSinceOneOnOne =
    daysSinceLastCheckIn != null
      ? daysSinceLastCheckIn
      : lastCheckInIso
        ? calendarDaysSinceDate(lastCheckInIso)
        : null;

  const nextCheckIn = nextCheckInInfo(standards, daysSinceOneOnOne, standardsCompliance);

  const givenCount = useMemo(
    () => recognitions.filter((r) => r.giver?.id === memberUserId).length,
    [recognitions, memberUserId],
  );
  const receivedCount = useMemo(
    () => recognitions.filter((r) => r.target.id === memberUserId).length,
    [recognitions, memberUserId],
  );

  const checkInsOk =
    !standards.checkInRequired ||
    standardsCompliance?.checkInStatus === "on_track" ||
    standardsCompliance?.checkInStatus === "due_soon" ||
    standardsCompliance?.checkInStatus === "not_required";
  const goalsOk =
    !standards.goalsRequired ||
    standardsCompliance?.goalsStatus === "on_track" ||
    standardsCompliance?.goalsStatus === "not_required";
  const recognitionOk = givenCount + receivedCount > 0;

  const healthChecks = [
    {
      key: "checkins",
      label: "Check-ins on schedule",
      ok: Boolean(checkInsOk && publishedMeetings.length > 0),
      detail:
        publishedMeetings.length === 0
          ? "No check-in yet"
          : standardsCompliance?.checkInActionText ?? "On track",
    },
    {
      key: "goals",
      label: "Active development goals",
      ok: Boolean(goalsOk && (!standards.goalsRequired || activeGoals.length > 0)),
      detail:
        activeGoals.length === 0
          ? "No active goals"
          : standardsCompliance?.goalsActionText ?? `${activeGoals.length} active`,
    },
    {
      key: "recognition",
      label: "Recognition activity",
      ok: recognitionOk,
      detail: recognitionOk ? `${givenCount} given · ${receivedCount} received` : "None yet",
    },
    {
      key: "feedback",
      label: "Feedback up to date",
      ok: false,
      detail: "Coming soon",
    },
  ];

  const healthScore = (() => {
    const applicable = healthChecks.filter((c) => c.key !== "feedback");
    const passed = applicable.filter((c) => c.ok).length;
    return Math.round((passed / Math.max(1, applicable.length)) * 100);
  })();

  const performanceCells = [
    {
      key: "checkins",
      label: "Check-ins",
      value: String(publishedMeetings.length),
      pill:
        publishedMeetings.length === 0
          ? { text: "None yet", tone: "muted" as const }
          : nextCheckIn.tone === "danger"
            ? { text: "Overdue", tone: "danger" as const }
            : nextCheckIn.tone === "warn"
              ? { text: "Due soon", tone: "warn" as const }
              : { text: "On track", tone: "ok" as const },
    },
    {
      key: "goals",
      label: "Goals",
      value: String(activeGoals.length),
      pill:
        standards.goalsRequired && activeGoals.length < standards.minimumActiveGoals
          ? { text: "Needs goals", tone: "danger" as const }
          : activeGoals.length === 0
            ? { text: "None", tone: "muted" as const }
            : { text: "Active", tone: "ok" as const },
    },
    {
      key: "recognition",
      label: "Recognition",
      value: String(givenCount + receivedCount),
      pill:
        givenCount + receivedCount === 0
          ? { text: "None yet", tone: "muted" as const }
          : { text: "Active", tone: "ok" as const },
    },
    {
      key: "feedback",
      label: "Feedback",
      value: "0",
      pill: { text: "Pending", tone: "muted" as const },
    },
  ];

  return (
    <div className="enterprise-mo">
      <section className="enterprise-mo-kpi-strip" aria-label="Key metrics">
        <article className="enterprise-mo-kpi">
          <span className="enterprise-mo-kpi-icon" aria-hidden>
            <IconTarget />
          </span>
          <div>
            <p className="enterprise-mo-kpi-label">Active Goals</p>
            <p className="enterprise-mo-kpi-value">{loading ? "—" : activeGoals.length}</p>
            <p className="enterprise-mo-kpi-hint">
              {loading
                ? "…"
                : activeGoals.length === 0
                  ? "No active goals"
                  : `${activeGoals.length} goal${activeGoals.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </article>
        <article className="enterprise-mo-kpi">
          <span className="enterprise-mo-kpi-icon" aria-hidden>
            <IconCalendar />
          </span>
          <div>
            <p className="enterprise-mo-kpi-label">Next Check-in</p>
            <p className={`enterprise-mo-kpi-value enterprise-mo-kpi-value--${nextCheckIn.tone}`}>
              {loading ? "—" : nextCheckIn.value}
            </p>
            <p className="enterprise-mo-kpi-hint">{loading ? "…" : nextCheckIn.hint}</p>
          </div>
        </article>
        <article className="enterprise-mo-kpi">
          <span className="enterprise-mo-kpi-icon" aria-hidden>
            <IconTrophy />
          </span>
          <div>
            <p className="enterprise-mo-kpi-label">Recognitions</p>
            <p className="enterprise-mo-kpi-value">
              {loading ? "—" : `${givenCount} / ${receivedCount}`}
            </p>
            <p className="enterprise-mo-kpi-hint">Given / Received</p>
          </div>
        </article>
        <article className="enterprise-mo-kpi">
          <span className="enterprise-mo-kpi-icon" aria-hidden>
            <IconChat />
          </span>
          <div>
            <p className="enterprise-mo-kpi-label">Feedback</p>
            <p className="enterprise-mo-kpi-value">0</p>
            <p className="enterprise-mo-kpi-hint">Pending</p>
          </div>
        </article>
      </section>

      {err ? (
        <p className="enterprise-form-error enterprise-mo-error" role="alert">
          {err}
        </p>
      ) : null}

      <div className="enterprise-mo-body">
        <div className="enterprise-mo-col-main">
          <section className="enterprise-mo-card">
            <header className="enterprise-mo-card-head">
              <h2 className="enterprise-mo-card-title">Performance Summary</h2>
            </header>
            <div className="enterprise-mo-perf-grid">
              {performanceCells.map((cell) => (
                <div key={cell.key} className="enterprise-mo-perf-cell">
                  <span className="enterprise-mo-perf-label">{cell.label}</span>
                  <strong className="enterprise-mo-perf-value">{loading ? "—" : cell.value}</strong>
                  <span className={`enterprise-mo-pill enterprise-mo-pill--${cell.pill.tone}`}>
                    {cell.pill.text}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="enterprise-mo-card">
            <header className="enterprise-mo-card-head">
              <h2 className="enterprise-mo-card-title">Development Goals</h2>
              {onOpenGrowthTab ? (
                <button type="button" className="enterprise-mo-link-btn" onClick={onOpenGrowthTab}>
                  View all
                </button>
              ) : null}
            </header>
            {loading ? (
              <p className="enterprise-mo-empty-copy">Loading…</p>
            ) : activeGoals.length === 0 ? (
              <div className="enterprise-mo-goals-empty">
                <IconMountain />
                <p className="enterprise-mo-empty-copy">
                  {isSelf
                    ? "No active development goals yet. Set a goal to grow and achieve more."
                    : "No active development goals for this member."}
                </p>
              </div>
            ) : (
              <ul className="enterprise-mo-goals-list">
                {activeGoals.slice(0, 5).map((goal) => (
                  <li key={goal.id} className="enterprise-mo-goal-row">
                    <div>
                      <strong>{goal.skill}</strong>
                      <span>Updated {formatRelativeShort(lastUpdatedAt(goal))}</span>
                    </div>
                    <span className="enterprise-mo-pill enterprise-mo-pill--ok">Active</span>
                  </li>
                ))}
              </ul>
            )}
            {canCreateDevGoal && onOpenGrowthTab ? (
              <div className="enterprise-mo-card-actions">
                <button type="button" className="enterprise-mo-primary-btn" onClick={onOpenGrowthTab}>
                  <IconPlus /> Create Goal
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="enterprise-mo-col-side">
          <section className="enterprise-mo-card enterprise-mo-health-card">
            <header className="enterprise-mo-card-head">
              <h2 className="enterprise-mo-card-title">Member Health</h2>
            </header>
            <div className="enterprise-mo-health-body">
              <HealthRing score={loading ? 0 : healthScore} />
              <ul className="enterprise-mo-health-list">
                {healthChecks.map((item) => (
                  <li key={item.key} className={item.ok ? "is-ok" : "is-miss"}>
                    <span className="enterprise-mo-health-check" aria-hidden>
                      {item.ok ? "✓" : "○"}
                    </span>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
