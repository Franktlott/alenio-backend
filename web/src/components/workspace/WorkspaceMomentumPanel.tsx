import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchTeamMomentum, type TeamMomentumMember } from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import { UserAvatar } from "../UserAvatar";

const GROUPS = [
  { key: "strong", label: "Strong momentum", hint: "On-time streaks going strong" },
  { key: "building", label: "Building", hint: "Picking up steam" },
  { key: "readyToRebuild", label: "Ready to rebuild", hint: "A fresh run starts with the next on-time task" },
] as const;

function weekLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Team momentum: on-time completions this month and who is on a streak. */
export function WorkspaceMomentumPanel({
  teamId,
  hasTeamFeatures,
  canManageBilling,
  onOpenMember,
}: {
  teamId: string;
  hasTeamFeatures: boolean | undefined;
  canManageBilling: boolean;
  onOpenMember: (userId: string) => void;
}) {
  const locked = hasTeamFeatures === false;
  const q = useQuery({
    queryKey: queryKeys.teamMomentum(teamId),
    queryFn: () => fetchTeamMomentum(teamId),
    enabled: !locked,
    staleTime: 60_000,
    retry: false,
  });

  if (locked) {
    return (
      <section className="dm-card ws-panel ws-panel--center" data-testid="ws-momentum-locked">
        <span className="ws-none-icon">
          <TrendingUp size={22} strokeWidth={2} />
        </span>
        <h2>Momentum comes with Pro and Operations</h2>
        <p>See who finishes on time, who is on a streak, and where the team needs a hand.</p>
        {canManageBilling ? (
          <Link to="/billing" className="ws-panel-btn">
            See plans
          </Link>
        ) : (
          <p className="ws-panel-note">Ask your workspace owner to upgrade.</p>
        )}
      </section>
    );
  }

  const data = q.data;
  const stats = data?.dashboard;
  const maxWeek = Math.max(1, ...(stats?.weeks.map((w) => w.total) ?? [1]));

  return (
    <div className="ws-momentum" data-testid="ws-momentum">
      <section className="dm-card ws-panel">
        <header className="ws-panel-head">
          <div>
            <h2>Momentum</h2>
            <p>On-time task completions this month and who's on a streak.</p>
          </div>
        </header>
        {q.isError ? (
          <p className="ws-panel-empty" role="alert">
            {q.error instanceof Error ? q.error.message : "Could not load Momentum."}
          </p>
        ) : (
          <>
            <div className="ws-stat-row">
              <div className="ws-stat">
                <span className="ws-stat-label">On time this month</span>
                <strong>{stats ? stats.onTimeCompletions : "—"}</strong>
                {stats?.onTimeChangePercent != null ? (
                  <small className={stats.onTimeChangePercent >= 0 ? "up" : "down"}>
                    {stats.onTimeChangePercent >= 0 ? "+" : ""}
                    {Math.round(stats.onTimeChangePercent)}% vs last month
                  </small>
                ) : (
                  <small>{stats ? `${stats.previousOnTimeCompletions} last month` : "\u00a0"}</small>
                )}
              </div>
              <div className="ws-stat">
                <span className="ws-stat-label">Active members</span>
                <strong>{data ? data.activeCount : "—"}</strong>
                <small>{data ? `of ${data.eligibleCount} in the last 30 days` : "\u00a0"}</small>
              </div>
              <div className="ws-stat">
                <span className="ws-stat-label">Due soon</span>
                <strong>{stats ? stats.taskStatus.dueSoon : "—"}</strong>
                <small>{stats ? `${stats.taskStatus.onTime} on track` : "\u00a0"}</small>
              </div>
              {data?.coachingVisible ? (
                <div className="ws-stat">
                  <span className="ws-stat-label">Overdue</span>
                  <strong className={stats && stats.taskStatus.overdue > 0 ? "warn" : ""}>{stats?.taskStatus.overdue ?? 0}</strong>
                  <small>Open tasks past due</small>
                </div>
              ) : null}
            </div>
            {stats && stats.weeks.length > 0 ? (
              <div className="ws-weeks" aria-label="On-time completions by week">
                {stats.weeks.map((w) => (
                  <div key={w.start} className="ws-week" title={`${w.onTime} of ${w.total} on time`}>
                    <div className="ws-week-bar">
                      <span className="ws-week-total" style={{ height: `${(w.total / maxWeek) * 100}%` }} />
                      <span className="ws-week-on" style={{ height: `${(w.onTime / maxWeek) * 100}%` }} />
                    </div>
                    <span className="ws-week-label">{weekLabel(w.start)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>

      {data ? (
        <div className="ws-band-grid">
          {GROUPS.map((g) => (
            <section key={g.key} className={`dm-card ws-band ws-band--${g.key}`} data-testid={`ws-band-${g.key}`}>
              <header>
                <h3>
                  {g.label} <span className="ws-members-count">{data.groups[g.key].length}</span>
                </h3>
                <p>{g.hint}</p>
              </header>
              {data.groups[g.key].length === 0 ? (
                <p className="ws-band-empty">No one here right now.</p>
              ) : (
                <ul>
                  {data.groups[g.key].map((m) => (
                    <MomentumRow key={m.userId} member={m} coaching={data.coachingVisible} onOpen={onOpenMember} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : null}

      {data && data.notEnoughActivity.count > 0 ? (
        <p className="ws-panel-note">
          {data.notEnoughActivity.count} {data.notEnoughActivity.count === 1 ? "member hasn't" : "members haven't"} finished a
          task on time yet.
        </p>
      ) : null}
    </div>
  );
}

function MomentumRow({
  member,
  coaching,
  onOpen,
}: {
  member: TeamMomentumMember;
  coaching: boolean;
  onOpen: (userId: string) => void;
}) {
  return (
    <li>
      <button type="button" className="ws-band-row" onClick={() => onOpen(member.userId)}>
        <UserAvatar user={member} className="ws-task-avatar" imgClassName="nw-avatar-img" alt="" />
        <span className="ws-band-row-copy">
          <span className="ws-band-row-name">{member.name || member.email}</span>
          <span className="ws-band-row-sub">
            {member.completedThisMonth} done this month
            {coaching && member.overdueTaskCount > 0 ? ` · ${member.overdueTaskCount} overdue` : ""}
          </span>
        </span>
        <span className="ws-band-streak" title={`Best: ${member.personalBestStreak}`}>
          {member.currentStreak}
          <small>streak</small>
        </span>
      </button>
    </li>
  );
}
