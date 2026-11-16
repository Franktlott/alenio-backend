import { useQuery } from "@tanstack/react-query";
import { Building2, Crown, KeyRound, Plus, UserPlus, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { UserAvatar } from "../components/UserAvatar";
import { WorkspaceCreateJoinModals } from "../components/WorkspaceCreateJoinModals";
import { WorkspaceCalendar } from "../components/workspace/WorkspaceCalendar";
import { WorkspaceMembersPanel, sortMembers } from "../components/workspace/WorkspaceMembersPanel";
import { WorkspaceMomentumPanel } from "../components/workspace/WorkspaceMomentumPanel";
import { WorkspaceSubNav, workspaceRoleLabel, type WorkspaceSection } from "../components/workspace/WorkspaceSubNav";
import { WorkspaceTasksPanel, isAssignedTo, isOpenTask } from "../components/workspace/WorkspaceTasksPanel";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { AddMemberModal } from "../components/AddMemberModal";
import { PendingInvitesModal } from "../components/PendingInvitesModal";
import { WorkspaceInviteModal } from "../components/workspace/WorkspaceInviteModal";
import {
  fetchTeamInvites,
  fetchWebTeam,
  fetchWebTeamTasks,
  inviteMemberByEmail,
  type WebTeamMemberRow,
  type WebTeamRow,
} from "../lib/api";
import { setPersistedEnterpriseTeamId } from "../lib/enterprise-selected-team";
import { queryKeys } from "../lib/query-keys";
import { resolveUserImageUrl } from "../lib/user-avatar";
import "./discover/discover-manage.css";
import "./web-network.css";
import "./web-workspace.css";
import "./web-workspace-sections.css";

const MANAGER_ROLES = new Set(["owner", "team_leader"]);

const SECTION_SUBTITLE: Record<WorkspaceSection, string> = {
  overview: "What's coming up for your workspace, and who is on the team.",
  tasks: "Assign, track and finish the work that keeps the day running.",
  calendar: "Events, shifts and meetings for everyone in the workspace.",
  members: "Everyone on the team, in one place.",
  momentum: "Fill stars with assigned tasks and spot who could use a nudge.",
};

/** Workspace pages: a section menu beside the rail, then Overview (feed + calendar) or one section. */
export function WebWorkspacePage({ section = "overview" }: { section?: WorkspaceSection }) {
  const { me, teams, selectedTeamId, setSelectedTeamId } = useEnterpriseShell();
  const navigate = useNavigate();
  const openPerson = useCallback((id: string) => navigate(`/people/${encodeURIComponent(id)}`), [navigate]);
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);

  const team = useMemo(() => {
    if (!teams || teams.length === 0) return null;
    return teams.find((t) => t.id === selectedTeamId) ?? teams[0] ?? null;
  }, [teams, selectedTeamId]);

  const detail = useQuery({
    queryKey: queryKeys.teamDetail(team?.id ?? ""),
    queryFn: () => fetchWebTeam(team!.id),
    enabled: Boolean(team),
    staleTime: 60_000,
  });

  const tasks = useQuery({
    queryKey: queryKeys.teamTasks(team?.id ?? ""),
    queryFn: () => fetchWebTeamTasks(team!.id),
    enabled: Boolean(team) && team?.hasTeamFeatures !== false,
    staleTime: 30_000,
  });

  const canInvite = MANAGER_ROLES.has(detail.data?.myRole ?? team?.role ?? "");
  const invites = useQuery({
    queryKey: ["team", "invites", team?.id ?? ""],
    queryFn: () => fetchTeamInvites(team!.id),
    enabled: Boolean(team) && canInvite,
    staleTime: 60_000,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  const addByEmail = async (email: string) => {
    if (!team) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await inviteMemberByEmail(team.id, email);
      setAddOpen(false);
      setInviteNotice(
        res.added
          ? `${res.user?.name ?? email} was added to ${team.name}.`
          : res.emailSent === false
            ? `Invite created for ${email}, but the email couldn't be sent. Share your invite code with them instead.`
            : `Invite sent to ${email}.`,
      );
      await Promise.all([detail.refetch(), invites.refetch()]);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add that person.");
    } finally {
      setAdding(false);
    }
  };

  const meId = me?.id ?? "";
  const myOpenTaskCount = useMemo(
    () => (tasks.data ? tasks.data.filter((t) => isOpenTask(t) && isAssignedTo(t, meId)).length : null),
    [tasks.data, meId],
  );

  if (me === undefined || teams === null) return <EnterprisePageLoading label="Loading your workspace" />;
  if (!me) return null;
  if (!team) return <NoWorkspaceState />;

  const myRole = detail.data?.myRole ?? team.role;
  const canModerate = MANAGER_ROLES.has(myRole);
  const openMember = (userId: string) => {
    if (canModerate || userId === me.id) {
      navigate(`/workspace/members/${encodeURIComponent(userId)}`);
    } else {
      openPerson(userId);
    }
  };
  const logoUrl = resolveUserImageUrl(team.image ?? null);
  const heroImage = logoUrl && logoUrl !== brokenLogo ? logoUrl : null;

  return (
    <div className="ws-layout" data-testid="web-workspace">
      <WorkspaceSubNav
        team={team}
        teams={teams}
        active={section}
        openTaskCount={myOpenTaskCount}
        onTeamChange={setSelectedTeamId}
        onInvite={canInvite ? () => setInviteOpen(true) : undefined}
      />
      <div className={`dm-page nw-page ws-page ws-page--${section}`}>
        <header className="dm-hero nw-hero ws-hero">
          <img src="/alenio-home-hero-afternoon.jpg" alt="" className="dm-hero-photo" />
          <div className="dm-hero-fade" aria-hidden />
          <div className="dm-hero-copy ws-hero-copy">
            <div className="ws-hero-row">
              {heroImage ? (
                <img src={heroImage} alt="" className="ws-hero-logo" onError={() => setBrokenLogo(heroImage)} />
              ) : (
                <span className="ws-hero-logo ws-hero-logo--blank">
                  <Building2 size={22} strokeWidth={2} />
                </span>
              )}
              <div>
                <h1>{team.name}</h1>
                <p>{SECTION_SUBTITLE[section]}</p>
              </div>
            </div>
          </div>
        </header>

        {inviteNotice ? (
          <p className="ws-invite-notice" role="status">
            {inviteNotice}
            <button type="button" aria-label="Dismiss" onClick={() => setInviteNotice(null)}>
              ×
            </button>
          </p>
        ) : null}

        {section === "overview" ? (
          <div className="ws-grid ws-grid--overview">
            <main className="nw-col ws-col--main">
              <WorkspaceCalendar teamId={team.id} meId={me.id} canManage={canModerate} tasks={tasks.data} />
            </main>
            <div className="nw-col ws-col--cal">
              <MembersStrip
                members={detail.data?.members ?? []}
                total={detail.data?._count?.members ?? team._count.members}
                loading={detail.isLoading}
                meId={me.id}
                onOpenPerson={openMember}
                onInvite={canInvite ? () => setInviteOpen(true) : undefined}
              />
            </div>
          </div>
        ) : (
          <main className="ws-section">
            {section === "tasks" ? (
              <WorkspaceTasksPanel
                teamId={team.id}
                teamName={team.name}
                meId={me.id}
                myRole={myRole}
                tasks={tasks.data ?? []}
                members={detail.data?.members ?? []}
                onOpenMember={openMember}
                onChanged={() => tasks.refetch()}
                loading={tasks.isLoading}
                error={
                  team.hasTeamFeatures === false
                    ? "Tasks come with the Pro and Operations plans."
                    : tasks.isError
                      ? "Could not load tasks. Try again in a moment."
                      : null
                }
              />
            ) : section === "calendar" ? (
              <div className="ws-section-cal">
                <WorkspaceCalendar teamId={team.id} meId={me.id} canManage={canModerate} tasks={tasks.data} />
              </div>
            ) : section === "members" ? (
              <WorkspaceMembersPanel
                members={detail.data?.members ?? []}
                loading={detail.isLoading}
                meId={me.id}
                onOpenMember={openMember}
                onInvite={canInvite ? () => setInviteOpen(true) : undefined}
              />
            ) : (
              <WorkspaceMomentumPanel
                teamId={team.id}
                meId={me.id}
                hasTeamFeatures={team.hasTeamFeatures}
                canManageBilling={myRole === "owner"}
                onOpenMember={openMember}
              />
            )}
          </main>
        )}
      </div>

      <WorkspaceInviteModal
        open={inviteOpen}
        teamName={team.name}
        inviteCode={detail.data?.inviteCode ?? team.inviteCode ?? null}
        pendingCount={invites.data?.length ?? 0}
        onClose={() => setInviteOpen(false)}
        onAddByEmail={() => {
          setInviteOpen(false);
          setAddError(null);
          setAddOpen(true);
        }}
        onOpenPending={() => {
          setInviteOpen(false);
          setPendingOpen(true);
        }}
      />
      <AddMemberModal
        open={addOpen}
        teamId={team.id}
        teamName={team.name}
        confirming={adding}
        error={addError}
        onClose={() => setAddOpen(false)}
        onConfirm={(email) => void addByEmail(email)}
        onClearError={() => setAddError(null)}
      />
      <PendingInvitesModal
        open={pendingOpen}
        teamId={team.id}
        invites={invites.data ?? []}
        inviteActionId={inviteActionId}
        onClose={() => setPendingOpen(false)}
        onReload={async () => {
          await invites.refetch();
        }}
        onError={(msg) => setInviteNotice(msg)}
        onInviteActionStart={setInviteActionId}
        onInviteActionEnd={() => setInviteActionId(null)}
      />
    </div>
  );
}

/** Everyone in the workspace as profile circles; owners and leaders first. */
function MembersStrip({
  members,
  total,
  loading,
  meId,
  onOpenPerson,
  onInvite,
}: {
  members: WebTeamMemberRow[];
  total: number;
  loading: boolean;
  meId: string;
  onOpenPerson: (userId: string) => void;
  onInvite?: () => void;
}) {
  const sorted = useMemo(() => sortMembers(members), [members]);

  return (
    <section className="dm-card ws-members" aria-label="Members" data-testid="ws-members">
      <div className="ws-members-head">
        <h2>
          <Users size={15} strokeWidth={2.2} />
          Members
          <span className="ws-members-count">{total}</span>
        </h2>
      </div>
      <ul className="ws-members-row">
        {onInvite ? (
          <li className="ws-member">
            <button type="button" className="ws-member-btn" onClick={onInvite} title="Invite people" data-testid="ws-members-invite">
              <span className="ws-member-ring">
                <span className="ws-member-avatar ws-member-avatar--invite">
                  <UserPlus size={18} strokeWidth={2.2} />
                </span>
              </span>
              <span className="ws-member-name">Invite</span>
            </button>
          </li>
        ) : null}
        {loading && members.length === 0
          ? Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="ws-member ws-member--skeleton" aria-hidden>
                <span className="ws-member-ring">
                  <span className="ws-member-avatar" />
                </span>
                <span className="ws-member-name">&nbsp;</span>
              </li>
            ))
          : sorted.map((m) => {
              const name = m.user.name ?? m.user.email ?? "Member";
              const lead = m.role === "owner" || m.role === "team_leader";
              const isMe = m.userId === meId;
              return (
                <li key={m.id} className="ws-member">
                  <button
                    type="button"
                    className={`ws-member-btn${lead ? " ws-member-btn--lead" : ""}`}
                    onClick={() => onOpenPerson(m.userId)}
                    title={`${name} · ${workspaceRoleLabel(m.role)}`}
                    data-testid={`ws-member-${m.userId}`}
                  >
                    <span className="ws-member-ring">
                      <UserAvatar user={m.user} className="ws-member-avatar" imgClassName="nw-avatar-img" alt="" />
                      {lead ? (
                        <span className="ws-member-badge" aria-label={workspaceRoleLabel(m.role)}>
                          <Crown size={10} strokeWidth={2.6} />
                        </span>
                      ) : null}
                    </span>
                    <span className="ws-member-name">{isMe ? "You" : firstName(name)}</span>
                  </button>
                </li>
              );
            })}
      </ul>
    </section>
  );
}

function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Member";
  if (trimmed.includes("@")) return trimmed.split("@")[0] ?? trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Shown when the person isn't in any workspace yet. */
function NoWorkspaceState() {
  const { setTeams, setSelectedTeamId, refreshMeAndTeams } = useEnterpriseShell();
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const enterWorkspace = (team: WebTeamRow) => {
    const row: WebTeamRow = {
      ...team,
      role: team.role ?? "owner",
      hasTeamFeatures: team.hasTeamFeatures ?? false,
      hasGoFeatures: team.hasGoFeatures ?? false,
    };
    setTeams((prev) => {
      const list = prev ?? [];
      return list.some((t) => t.id === row.id) ? list : [...list, row];
    });
    setPersistedEnterpriseTeamId(row.id);
    setSelectedTeamId(row.id);
  };

  return (
    <div className="dm-page nw-page ws-page" data-testid="web-workspace">
      <header className="dm-hero nw-hero ws-hero">
        <img src="/alenio-home-hero-afternoon.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy">
          <h1>Workspace</h1>
          <p>Tasks, schedules, and the people you work with — in one place.</p>
        </div>
      </header>

      <section className="ws-none" aria-labelledby="ws-none-title" data-testid="ws-none">
        <header className="ws-none-head">
          <h2 id="ws-none-title">You're not in a workspace yet</h2>
          <p>
            A workspace is where your team runs the day — tasks, schedules, and development. Start your own or join
            your team.
          </p>
          {info ? (
            <p className="ws-none-info" role="status">
              {info}
            </p>
          ) : null}
        </header>
        <div className="ws-none-options">
          <article className="ws-none-option ws-none-option--create">
            <span className="ws-none-pill">14-day free trial</span>
            <span className="ws-none-icon">
              <Building2 size={24} strokeWidth={2} />
            </span>
            <h3>Start your own workspace</h3>
            <ul>
              <li>Tasks, schedules, and events</li>
              <li>Check-ins and team development</li>
              <li>Seneca AI and Alenio Go</li>
            </ul>
            <button type="button" className="ws-none-btn ws-none-btn--primary" onClick={() => setCreateOpen(true)} data-testid="ws-none-create">
              <Plus size={17} strokeWidth={2.4} />
              Create workspace
            </button>
            <small>No card required</small>
          </article>
          <article className="ws-none-option ws-none-option--join">
            <span className="ws-none-icon ws-none-icon--soft">
              <KeyRound size={22} strokeWidth={2.2} />
            </span>
            <h3>Join your team</h3>
            <p>Got an invite code from your manager? Enter it to join their workspace.</p>
            <button type="button" className="ws-none-btn ws-none-btn--outline" onClick={() => setJoinOpen(true)} data-testid="ws-none-join">
              <KeyRound size={15} strokeWidth={2.2} />
              Join with invite code
            </button>
            <small>Free for team members</small>
          </article>
        </div>
      </section>

      <WorkspaceCreateJoinModals
        joinOpen={joinOpen}
        createOpen={createOpen}
        onCloseJoin={() => setJoinOpen(false)}
        onCloseCreate={() => setCreateOpen(false)}
        onRefreshWorkspaces={refreshMeAndTeams}
        onJoinSuccessInfo={(msg) => setInfo(msg)}
        onWorkspaceEntered={enterWorkspace}
      />
    </div>
  );
}
