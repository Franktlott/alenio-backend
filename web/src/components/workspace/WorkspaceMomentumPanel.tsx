import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchTeamMomentum, type TeamMomentumMember } from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import { UserAvatar } from "../UserAvatar";

function memberStars(member: TeamMomentumMember): number {
  return member.currentStars ?? member.currentStreak ?? 0;
}

function starsRoster(data: Awaited<ReturnType<typeof fetchTeamMomentum>>): TeamMomentumMember[] {
  if (data.roster?.length) return data.roster;
  return [
    ...data.groups.strong,
    ...data.groups.building,
    ...data.groups.readyToRebuild,
    ...data.notEnoughActivity.members,
  ];
}

/** Team Stars: hollow→filled personal progress and a simple leader roster. */
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
      <section className="dm-card ws-panel ws-panel--center" data-testid="ws-stars-locked">
        <span className="ws-none-icon">
          <Star size={22} strokeWidth={2} />
        </span>
        <h2>Stars comes with Pro and Operations</h2>
        <p>See who is filling stars and who could use a nudge.</p>
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
  const rows = data ? starsRoster(data) : [];
  const needsNudge = data?.needsNudgeCount ?? rows.filter((m) => (m.needsNudge ?? memberStars(m) === 0)).length;

  return (
    <div className="ws-momentum" data-testid="ws-stars">
      <section className="dm-card ws-panel">
        <header className="ws-panel-head">
          <div>
            <h2>Stars</h2>
            <p>Assigned task completions fill stars. Milestones at 5, 10, 15, then every 10.</p>
          </div>
        </header>
        {q.isError ? (
          <p className="ws-panel-empty" role="alert">
            {q.error instanceof Error ? q.error.message : "Could not load Stars."}
          </p>
        ) : (
          <div className="ws-stat-row">
            <div className="ws-stat">
              <span className="ws-stat-label">Members with stars</span>
              <strong>{data ? data.activeCount : "—"}</strong>
              <small>{data ? `of ${data.eligibleCount}` : "\u00a0"}</small>
            </div>
            <div className="ws-stat">
              <span className="ws-stat-label">Need a nudge</span>
              <strong>{data ? needsNudge : "—"}</strong>
              <small>Zero stars so far</small>
            </div>
          </div>
        )}
      </section>

      {data ? (
        <section className="dm-card ws-panel" data-testid="ws-stars-roster">
          <header className="ws-panel-head">
            <div>
              <h2>Team</h2>
              <p>Sorted so people who need a nudge show up first.</p>
            </div>
          </header>
          {rows.length === 0 ? (
            <p className="ws-panel-empty">No team members yet.</p>
          ) : (
            <ul className="ws-stars-list">
              {rows.map((m) => (
                <StarsRow
                  key={m.userId}
                  member={m}
                  coaching={data.coachingVisible}
                  onOpen={onOpenMember}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function StarsRow({
  member,
  coaching,
  onOpen,
}: {
  member: TeamMomentumMember;
  coaching: boolean;
  onOpen: (userId: string) => void;
}) {
  const stars = memberStars(member);
  const remaining = member.remainingToMilestone;
  const needsNudge = member.needsNudge ?? stars === 0;
  return (
    <li>
      <button
        type="button"
        className={`ws-band-row${needsNudge ? " ws-stars-row--nudge" : ""}`}
        onClick={() => onOpen(member.userId)}
      >
        <UserAvatar user={member} className="ws-task-avatar" imgClassName="nw-avatar-img" alt="" />
        <span className="ws-band-row-copy">
          <span className="ws-band-row-name">{member.name || member.email}</span>
          <span className="ws-band-row-sub">
            {needsNudge
              ? "0 stars · get started"
              : remaining != null
                ? `${remaining} to milestone`
                : `${member.completedThisMonth} done this month`}
            {coaching && member.overdueTaskCount > 0 ? ` · ${member.overdueTaskCount} overdue` : ""}
          </span>
        </span>
        <span className="ws-band-streak" title={`Best: ${member.personalBestStars ?? member.personalBestStreak}`}>
          {stars}
          <small>stars</small>
        </span>
      </button>
    </li>
  );
}
