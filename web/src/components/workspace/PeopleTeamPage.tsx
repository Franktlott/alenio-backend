import {
  BarChart3,
  CalendarDays,
  Flag,
  Layers,
  Send,
  Shield,
  SquareCheckBig,
  Sprout,
  Star,
  Target,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  cancelTeamInvite,
  resendTeamInvite,
  type TeamMemberStatsMap,
  type WebTeamInvite,
  type WebTeamMemberRow,
  type WebTeamRow,
} from "../../lib/api";
import { formatDaysSinceCheckIn } from "../../lib/member-stats-display";
import { Button, EmptyState, RowActions, SearchField, Select } from "../ui";
import { UserAvatar } from "../UserAvatar";
import { sortMembers } from "./WorkspaceMembersPanel";
import { workspaceRoleLabel } from "./WorkspaceSubNav";

type PeopleSection = "members" | "invitations" | "teams" | "goals" | "roles";

const ROLE_FILTERS = [
  { id: "all", label: "All Roles" },
  { id: "owner", label: "Owner" },
  { id: "team_leader", label: "Team leader" },
  { id: "admin", label: "Admin" },
  { id: "member", label: "Member" },
] as const;

const ROLE_GROUPS: Array<{ id: string; label: string; hint: string }> = [
  { id: "owner", label: "Owner", hint: "Runs the workspace, billing, and who belongs." },
  { id: "team_leader", label: "Team leader", hint: "Invites people and follows their goals and check-ins." },
  { id: "admin", label: "Admin", hint: "A legacy role. Can view the workspace, not manage it." },
  { id: "member", label: "Member", hint: "Does the work and shows up for check-ins." },
];

const SECTION_TITLE: Record<PeopleSection, string> = {
  members: "Workspace Members",
  invitations: "Invitations",
  teams: "Teams",
  goals: "Goals & Check-ins",
  roles: "Access & Roles",
};

function roleBucket(role: string): string {
  if (role === "owner" || role === "team_leader" || role === "admin") return role;
  return "member";
}

function matchesRole(role: string, filter: string): boolean {
  if (filter === "all") return true;
  return roleBucket(role) === filter;
}

function matchesQuery(member: WebTeamMemberRow, query: string): boolean {
  if (!query) return true;
  const hay = `${member.user.name ?? ""} ${member.user.email ?? ""}`.toLowerCase();
  return hay.includes(query);
}

function goalsOnTrackLabel(members: WebTeamMemberRow[], stats: TeamMemberStatsMap | undefined): string {
  const withGoals = members.filter((member) => (stats?.[member.userId]?.activeDevGoals ?? 0) > 0);
  if (withGoals.length === 0) return "0%";
  const onTrack = withGoals.filter((member) => (stats?.[member.userId]?.devEngagementPct ?? 0) >= 50);
  return `${Math.round((onTrack.length / withGoals.length) * 100)}%`;
}

function checkInsThisWeek(members: WebTeamMemberRow[], stats: TeamMemberStatsMap | undefined): number {
  return members.filter((member) => {
    const days = stats?.[member.userId]?.daysSinceLastOneOnOne;
    return days != null && days <= 7;
  }).length;
}

function goalCountLabel(count: number): string {
  return count === 1 ? "1 goal" : `${count} goals`;
}

function starCountLabel(count: number): string {
  return count === 1 ? "1 star" : `${count} stars`;
}

function attentionScore(stats: TeamMemberStatsMap | undefined, userId: string): number {
  const row = stats?.[userId];
  const noGoal = (row?.activeDevGoals ?? 0) === 0;
  const stale = row?.daysSinceLastOneOnOne == null || row.daysSinceLastOneOnOne > 7;
  return (stale ? 2 : 0) + (noGoal ? 1 : 0);
}

export function PeopleTeamPage({
  teamId,
  members,
  loading,
  meId,
  teams,
  selectedTeamId,
  invites,
  canInvite,
  stats,
  statsLoading,
  onOpenMember,
  onInvite,
  onSwitchTeam,
  onReloadInvites,
  onInviteError,
  inviteActionId,
  onInviteActionStart,
  onInviteActionEnd,
}: {
  teamId: string;
  members: WebTeamMemberRow[];
  loading: boolean;
  meId: string;
  teams: WebTeamRow[];
  selectedTeamId: string;
  invites: WebTeamInvite[];
  canInvite: boolean;
  stats: TeamMemberStatsMap | undefined;
  statsLoading: boolean;
  onOpenMember: (userId: string) => void;
  onInvite?: () => void;
  onSwitchTeam: (teamId: string) => void;
  onReloadInvites: () => Promise<void>;
  onInviteError: (message: string) => void;
  inviteActionId: string | null;
  onInviteActionStart: (inviteId: string) => void;
  onInviteActionEnd: () => void;
}) {
  const [section, setSection] = useState<PeopleSection>("members");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const showFilters = section === "members" || section === "goals" || section === "roles";
  const needle = query.trim().toLowerCase();

  const sorted = useMemo(() => sortMembers(members), [members]);
  const filtered = useMemo(
    () => sorted.filter((member) => matchesQuery(member, needle) && matchesRole(member.role, roleFilter)),
    [sorted, needle, roleFilter],
  );
  const goalsSorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          attentionScore(stats, b.userId) - attentionScore(stats, a.userId) ||
          (a.user.name ?? a.user.email ?? "").localeCompare(b.user.name ?? b.user.email ?? ""),
      ),
    [filtered, stats],
  );

  const nav = [
    { id: "members" as const, label: "Workspace Members", count: members.length, icon: <Users size={16} strokeWidth={2.2} /> },
    { id: "invitations" as const, label: "Invitations", count: canInvite ? invites.length : 0, icon: <Send size={16} strokeWidth={2.2} /> },
    { id: "teams" as const, label: "Teams", count: teams.length, icon: <Layers size={16} strokeWidth={2.2} /> },
    { id: "goals" as const, label: "Goals & Check-ins", icon: <Target size={16} strokeWidth={2.2} /> },
    { id: "roles" as const, label: "Access & Roles", icon: <Shield size={16} strokeWidth={2.2} /> },
  ];

  return (
    <div className="pt-page" data-testid="ws-members-page">
      <aside className="pt-side">
        <div className="pt-hero">
          <img src="/alenio-home-hero-afternoon.jpg" alt="" className="pt-hero-photo" />
          <div className="pt-hero-fade" aria-hidden />
          <div className="pt-hero-copy">
            <h1>People & Team</h1>
            <p>Manage your members, roles, and team progress.</p>
          </div>
        </div>

        <nav className="pt-nav" aria-label="People">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "pt-nav-item is-active" : "pt-nav-item"}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <span className="pt-nav-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="pt-nav-label">{item.label}</span>
              {item.count != null ? <span className="pt-nav-count">{item.count}</span> : null}
            </button>
          ))}
        </nav>

        {onInvite ? (
          <div className="pt-promo">
            <span className="pt-promo-icon" aria-hidden>
              <Users size={18} strokeWidth={2.2} />
            </span>
            <h2>Build a stronger team</h2>
            <p>Invite members, create teams, and set shared goals.</p>
            <Button variant="secondary" icon={<UserPlus size={15} strokeWidth={2.2} />} onClick={onInvite}>
              Invite Members
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="pt-main">
        <div className="pt-stats">
          <StatCard icon={<Users size={18} strokeWidth={2.2} />} value={String(members.length)} label="Members" />
          <StatCard icon={<Target size={18} strokeWidth={2.2} />} value={String(teams.length)} label="Teams" />
          <StatCard
            icon={<BarChart3 size={18} strokeWidth={2.2} />}
            value={statsLoading ? "—" : goalsOnTrackLabel(members, stats)}
            label="Goals on track"
          />
          <StatCard
            icon={<SquareCheckBig size={18} strokeWidth={2.2} />}
            value={statsLoading ? "—" : String(checkInsThisWeek(members, stats))}
            label="Check-ins this week"
          />
        </div>

        <section className="pt-panel" aria-labelledby="pt-section-title">
          <header className="pt-toolbar">
            <h2 id="pt-section-title">{SECTION_TITLE[section]}</h2>
            {showFilters ? (
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search members..."
                className="pt-search"
              />
            ) : (
              <span className="pt-toolbar-spacer" />
            )}
            {showFilters ? (
              <Select
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="pt-role-filter"
              >
                {ROLE_FILTERS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : null}
            {onInvite ? (
              <Button
                variant="primary"
                icon={<UserPlus size={16} strokeWidth={2.2} />}
                onClick={onInvite}
                data-testid="ws-members-page-invite"
              >
                Invite
              </Button>
            ) : null}
          </header>

          {section === "members" ? (
            <MemberList
              members={filtered}
              loading={loading}
              meId={meId}
              stats={stats}
              statsLoading={statsLoading}
              query={needle}
              onOpenMember={onOpenMember}
            />
          ) : null}
          {section === "goals" ? (
            <MemberList
              members={goalsSorted}
              loading={loading}
              meId={meId}
              stats={stats}
              statsLoading={statsLoading}
              query={needle}
              onOpenMember={onOpenMember}
              emptyTitle="No one to review"
              emptyDescription="Goals and check-ins show up here once people are in the workspace."
            />
          ) : null}
          {section === "roles" ? (
            <RoleGroups
              members={filtered}
              loading={loading}
              meId={meId}
              stats={stats}
              statsLoading={statsLoading}
              query={needle}
              onOpenMember={onOpenMember}
            />
          ) : null}
          {section === "invitations" ? (
            <InvitationList
              teamId={teamId}
              invites={canInvite ? invites : []}
              canInvite={canInvite}
              inviteActionId={inviteActionId}
              onReload={onReloadInvites}
              onError={onInviteError}
              onStart={onInviteActionStart}
              onEnd={onInviteActionEnd}
            />
          ) : null}
          {section === "teams" ? (
            <TeamList teams={teams} selectedTeamId={selectedTeamId} onSwitchTeam={onSwitchTeam} />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <article className="pt-stat">
      <span className="pt-stat-icon" aria-hidden>
        {icon}
      </span>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function MemberList({
  members,
  loading,
  meId,
  stats,
  statsLoading,
  query,
  onOpenMember,
  emptyTitle = "No members yet",
  emptyDescription,
}: {
  members: WebTeamMemberRow[];
  loading: boolean;
  meId: string;
  stats: TeamMemberStatsMap | undefined;
  statsLoading: boolean;
  query: string;
  onOpenMember: (userId: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (loading && members.length === 0) {
    return <p className="pt-empty">Loading members…</p>;
  }
  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users size={20} strokeWidth={2} />}
        title={query ? "No one matches that search" : emptyTitle}
        description={query ? "Try a different name, email, or role." : emptyDescription}
      />
    );
  }
  return (
    <ul className="pt-people">
      {members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          meId={meId}
          stats={stats}
          statsLoading={statsLoading}
          onOpenMember={onOpenMember}
        />
      ))}
    </ul>
  );
}

function MemberRow({
  member,
  meId,
  stats,
  statsLoading,
  onOpenMember,
}: {
  member: WebTeamMemberRow;
  meId: string;
  stats: TeamMemberStatsMap | undefined;
  statsLoading: boolean;
  onOpenMember: (userId: string) => void;
}) {
  const navigate = useNavigate();
  const name = member.user.name ?? member.user.email ?? "Member";
  const goals = stats?.[member.userId]?.activeDevGoals ?? 0;
  const stars = stats?.[member.userId]?.streak ?? 0;
  const checkIn = statsLoading
    ? "…"
    : formatDaysSinceCheckIn(stats?.[member.userId]?.daysSinceLastOneOnOne);
  const lead = member.role === "owner" || member.role === "team_leader";

  return (
    <li>
      <div
        className="pt-person"
        role="button"
        tabIndex={0}
        data-testid={`ws-member-card-${member.userId}`}
        onClick={() => onOpenMember(member.userId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenMember(member.userId);
          }
        }}
      >
        <UserAvatar user={member.user} className="al-row-avatar pt-avatar" imgClassName="pt-avatar-img" alt="" />
        <div className="pt-person-copy">
          <div className="pt-person-name">
            <strong>{name}</strong>
            <span className={lead ? "pt-role pt-role--lead" : "pt-role"}>{workspaceRoleLabel(member.role)}</span>
            {member.userId === meId ? <span className="pt-you">You</span> : null}
          </div>
          {member.user.email ? <span className="pt-email">{member.user.email}</span> : null}
        </div>
        <span className="pt-meta pt-meta--stars">
          <Star size={14} strokeWidth={2.1} aria-hidden />
          {statsLoading ? "…" : starCountLabel(stars)}
        </span>
        <span className="pt-meta">
          <Flag size={14} strokeWidth={2.1} aria-hidden />
          {statsLoading ? "…" : goalCountLabel(goals)}
        </span>
        <span className="pt-meta pt-meta--checkin">
          <CalendarDays size={14} strokeWidth={2.1} aria-hidden />
          {checkIn}
        </span>
        <span
          className="pt-menu"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActions
            label={`Actions for ${name}`}
            testId={`ws-member-menu-${member.userId}`}
            actions={[
              { id: "open", label: "Open member", icon: <Sprout size={15} strokeWidth={2} />, onSelect: () => onOpenMember(member.userId) },
              {
                id: "profile",
                label: "View public profile",
                icon: <UserRound size={15} strokeWidth={2} />,
                onSelect: () => navigate(`/people/${encodeURIComponent(member.userId)}`),
              },
            ]}
          />
        </span>
      </div>
    </li>
  );
}

function RoleGroups({
  members,
  loading,
  meId,
  stats,
  statsLoading,
  query,
  onOpenMember,
}: {
  members: WebTeamMemberRow[];
  loading: boolean;
  meId: string;
  stats: TeamMemberStatsMap | undefined;
  statsLoading: boolean;
  query: string;
  onOpenMember: (userId: string) => void;
}) {
  if (loading && members.length === 0) return <p className="pt-empty">Loading members…</p>;
  const groups = ROLE_GROUPS.map((group) => ({
    ...group,
    people: members.filter((member) => roleBucket(member.role) === group.id),
  })).filter((group) => group.people.length > 0);
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Shield size={20} strokeWidth={2} />}
        title={query ? "No one matches that search" : "No roles to show"}
        description={query ? "Try a different name, email, or role." : undefined}
      />
    );
  }
  return (
    <div className="pt-role-groups">
      {groups.map((group) => (
        <section key={group.id} className="pt-role-group" aria-label={group.label}>
          <header>
            <h3>
              {group.label}
              <span>{group.people.length}</span>
            </h3>
            <p>{group.hint}</p>
          </header>
          <ul className="pt-people">
            {group.people.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                meId={meId}
                stats={stats}
                statsLoading={statsLoading}
                onOpenMember={onOpenMember}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function InvitationList({
  teamId,
  invites,
  canInvite,
  inviteActionId,
  onReload,
  onError,
  onStart,
  onEnd,
}: {
  teamId: string;
  invites: WebTeamInvite[];
  canInvite: boolean;
  inviteActionId: string | null;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
  onStart: (inviteId: string) => void;
  onEnd: () => void;
}) {
  if (!canInvite) {
    return (
      <EmptyState
        icon={<Send size={20} strokeWidth={2} />}
        title="Invitations stay with team leaders"
        description="Owners and team leaders can see who has been invited."
      />
    );
  }
  if (invites.length === 0) {
    return (
      <EmptyState
        icon={<Send size={20} strokeWidth={2} />}
        title="No pending invitations"
        description="People you invite will wait here until they join."
      />
    );
  }
  return (
    <ul className="pt-invites">
      {invites.map((invite) => {
        const inviter = invite.invitedBy?.name ?? invite.invitedBy?.email ?? "A team leader";
        const busy = inviteActionId === invite.id;
        return (
          <li key={invite.id} className="pt-invite">
            <span className="pt-invite-mark" aria-hidden>
              {(invite.email[0] ?? "?").toUpperCase()}
            </span>
            <div className="pt-invite-copy">
              <strong>{invite.email}</strong>
              <span>Invited by {inviter}</span>
            </div>
            <span className="pt-invite-status">Pending</span>
            <div className="pt-invite-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Cancel invite for ${invite.email}?`)) return;
                  onStart(invite.id);
                  void cancelTeamInvite(teamId, invite.id)
                    .then(() => onReload())
                    .catch((error: unknown) => onError(error instanceof Error ? error.message : "Cancel failed."))
                    .finally(onEnd);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Resend invite to ${invite.email}?`)) return;
                  onStart(invite.id);
                  void resendTeamInvite(teamId, invite.id)
                    .catch((error: unknown) => onError(error instanceof Error ? error.message : "Resend failed."))
                    .finally(onEnd);
                }}
              >
                {busy ? "Sending…" : "Resend"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TeamList({
  teams,
  selectedTeamId,
  onSwitchTeam,
}: {
  teams: WebTeamRow[];
  selectedTeamId: string;
  onSwitchTeam: (teamId: string) => void;
}) {
  if (teams.length === 0) {
    return <EmptyState icon={<Layers size={20} strokeWidth={2} />} title="No teams yet" />;
  }
  return (
    <ul className="pt-teams">
      {teams.map((team) => {
        const current = team.id === selectedTeamId;
        const members = team._count?.members ?? 0;
        return (
          <li key={team.id}>
            <button
              type="button"
              className={current ? "pt-team is-current" : "pt-team"}
              onClick={() => {
                if (!current) onSwitchTeam(team.id);
              }}
              aria-current={current ? "true" : undefined}
            >
              <span className="pt-team-mark" aria-hidden>
                {team.name.trim().charAt(0).toUpperCase() || "T"}
              </span>
              <span className="pt-team-copy">
                <strong>{team.name}</strong>
                <span>
                  {workspaceRoleLabel(team.role)}
                  <span aria-hidden> · </span>
                  {members === 1 ? "1 member" : `${members} members`}
                </span>
              </span>
              {current ? <span className="pt-team-current">Current</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
