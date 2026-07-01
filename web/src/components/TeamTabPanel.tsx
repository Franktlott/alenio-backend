import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { queryKeys } from "../lib/query-keys";
import { AddMemberModal } from "./AddMemberModal";
import { PendingInvitesModal } from "./PendingInvitesModal";
import { PendingCalendarEventsModal } from "./PendingCalendarEventsModal";
import { TeamMemberManageModal } from "./TeamMemberManageModal";
import { TeamMemberProfilePanel } from "./TeamMemberProfilePanel";
import { OneOnOneTemplatesModal } from "./OneOnOneTemplatesModal";
import { WorkplaceStandardsModal, mergeWorkplaceStandards } from "./WorkplaceStandardsModal";
import { StandardsStatusKey } from "./StandardsStatusKey";
import {
  approveTeamJoinRequest,
  fetchPendingCalendarEvents,
  fetchTeamInvites,
  fetchTeamJoinRequests,
  fetchTeamMemberStats,
  fetchWebTeam,
  fetchWebTeamSubscription,
  fetchWebTeamTasks,
  inviteMemberByEmail,
  rejectTeamJoinRequest,
  removeTeamMemberApi,
  setTeamMemberRole,
  transferTeamOwnership,
  type ApiTask,
  type TeamMemberStatsMap,
  type WebMeUser,
  type WebTeamDetail,
  type WebTeamInvite,
  type WebTeamJoinRequest,
  type WebTeamMemberRow,
  type WebTeamRow,
} from "../lib/api";
import {
  formatCheckInFrequencySummary,
  formatDueSoonThresholdSummary,
  type MemberStandardsCompliance,
  type WorkplaceStandards,
} from "../lib/workplace-standards";

function isTaskOverdue(t: ApiTask, todayStart: Date): boolean {
  if (t.status === "done") return false;
  if (!t.dueDate) return false;
  return new Date(t.dueDate) < todayStart;
}

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  if (role === "admin") return "Admin";
  return "Member";
}

function roleBadgeClass(role: string): string {
  if (role === "owner") return "enterprise-team-role-badge enterprise-team-role-badge-owner";
  if (role === "team_leader") return "enterprise-team-role-badge enterprise-team-role-badge-leader";
  if (role === "admin") return "enterprise-team-role-badge enterprise-team-role-badge-admin";
  return "enterprise-team-role-badge";
}

function roleAbbrev(role: string): string {
  if (role === "owner") return "OWN";
  if (role === "team_leader") return "TL";
  if (role === "admin") return "ADM";
  return "MBR";
}

function rolePillClass(role: string): string {
  if (role === "owner") return "enterprise-team-roster-role-pill enterprise-team-roster-role-pill--owner";
  if (role === "team_leader") return "enterprise-team-roster-role-pill enterprise-team-roster-role-pill--leader";
  if (role === "admin") return "enterprise-team-roster-role-pill enterprise-team-roster-role-pill--admin";
  return "enterprise-team-roster-role-pill";
}

type RosterTone = "ok" | "warn" | "bad" | "muted";

function formatRosterCheckInPrimary(days: number | null | undefined): string {
  if (days == null) return "No check-in";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function rosterCheckInColumn(
  compliance: MemberStandardsCompliance | undefined,
  daysSinceCheckIn: number | null | undefined,
  standards: WorkplaceStandards,
): { tone: RosterTone; primary: string } {
  if (!standards.checkInRequired) {
    return { tone: "muted", primary: "—" };
  }
  if (!compliance) {
    return { tone: "muted", primary: "—" };
  }
  if (compliance.checkInStatus === "on_track") {
    return {
      tone: "ok",
      primary: formatRosterCheckInPrimary(daysSinceCheckIn),
    };
  }
  if (compliance.checkInStatus === "due_soon") {
    return { tone: "warn", primary: "Due soon" };
  }
  if (compliance.checkInStatus === "overdue") {
    if (daysSinceCheckIn == null) {
      return { tone: "bad", primary: "No check-in" };
    }
    return { tone: "bad", primary: "Overdue" };
  }
  return { tone: "muted", primary: "—" };
}

function rosterGoalsColumn(
  standards: WorkplaceStandards,
  activeGoals: number,
): { tone: RosterTone; primary: string } {
  if (!standards.goalsRequired || standards.minimumActiveGoals <= 0) {
    return { tone: "muted", primary: "— Optional" };
  }
  const min = standards.minimumActiveGoals;
  const met = activeGoals >= min;
  return {
    tone: met ? "ok" : "bad",
    primary: `${activeGoals} / ${min}`,
  };
}

function rosterOverallStatus(
  compliance: MemberStandardsCompliance | undefined,
  daysSinceCheckIn: number | null | undefined,
  standards: WorkplaceStandards,
  activeGoals: number,
): { tone: RosterTone; label: string } {
  if (!compliance) return { tone: "muted", label: "—" };

  if (standards.checkInRequired) {
    if (compliance.checkInStatus === "overdue") {
      if (daysSinceCheckIn == null) return { tone: "bad", label: "Missing check-in" };
      return { tone: "bad", label: "Overdue" };
    }
    if (compliance.checkInStatus === "due_soon") {
      return { tone: "warn", label: "Due soon" };
    }
  }

  if (standards.goalsRequired && activeGoals < standards.minimumActiveGoals) {
    return { tone: "warn", label: "Needs goals" };
  }

  if (!standards.checkInRequired && !standards.goalsRequired) {
    return { tone: "muted", label: "Not required" };
  }

  return { tone: "ok", label: "On track" };
}

function IconRosterCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconRosterClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconRosterX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconRosterWarn() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function RosterStatusIcon({ tone }: { tone: RosterTone }) {
  if (tone === "muted") {
    return <span className="enterprise-team-roster-status-icon enterprise-team-roster-status-icon--muted" aria-hidden>—</span>;
  }
  const className = `enterprise-team-roster-status-icon enterprise-team-roster-status-icon--${tone}`;
  if (tone === "ok") return <span className={className}><IconRosterCheck /></span>;
  if (tone === "warn") return <span className={className}><IconRosterClock /></span>;
  return <span className={className}><IconRosterX /></span>;
}

function RosterOverallIcon({ tone, label }: { tone: RosterTone; label?: string }) {
  if (tone === "muted") {
    return <span className="enterprise-team-roster-status-icon enterprise-team-roster-status-icon--muted" aria-hidden>—</span>;
  }
  const className = `enterprise-team-roster-status-icon enterprise-team-roster-status-icon--${tone}`;
  if (tone === "ok") return <span className={className}><IconRosterCheck /></span>;
  if (tone === "warn") {
    if (label === "Due soon") {
      return (
        <span className={className}>
          <IconRosterClock />
        </span>
      );
    }
    return (
      <span className={className}>
        <IconRosterWarn />
      </span>
    );
  }
  return <span className={className}><IconRosterX /></span>;
}

function RosterMetricCell({
  tone,
  primary,
  secondary,
  icon = "status",
}: {
  tone: RosterTone;
  primary: string;
  secondary?: string;
  icon?: "status" | "none";
}) {
  return (
    <span className="enterprise-team-roster-metric-cell">
      {icon === "status" ? (
        <span className={`enterprise-team-roster-metric-primary enterprise-team-roster-metric-primary--${tone}`}>
          <RosterStatusIcon tone={tone} />
          <span>{primary}</span>
        </span>
      ) : (
        <span className={`enterprise-team-roster-metric-primary enterprise-team-roster-metric-primary--${tone}`}>
          <span>{primary}</span>
        </span>
      )}
      {secondary ? <span className="enterprise-team-roster-metric-secondary">{secondary}</span> : null}
    </span>
  );
}

function RosterStatusLegend() {
  return (
    <footer className="enterprise-team-roster-legend" aria-label="Status key">
      <span className="enterprise-team-roster-legend-item">
        <RosterStatusIcon tone="ok" /> On track
      </span>
      <span className="enterprise-team-roster-legend-sep" aria-hidden>·</span>
      <span className="enterprise-team-roster-legend-item">
        <RosterStatusIcon tone="warn" /> Due soon
      </span>
      <span className="enterprise-team-roster-legend-sep" aria-hidden>·</span>
      <span className="enterprise-team-roster-legend-item">
        <RosterStatusIcon tone="bad" /> Attention
      </span>
      <span className="enterprise-team-roster-legend-sep" aria-hidden>·</span>
      <span className="enterprise-team-roster-legend-item enterprise-team-roster-legend-item--muted">
        <span className="enterprise-team-roster-status-icon enterprise-team-roster-status-icon--muted" aria-hidden>—</span> Not required
      </span>
    </footer>
  );
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconUserPlus({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function IconSearch({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconStatActions() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function IconTemplateOneOne() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  );
}

function IconWorkplaceStandards() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3l7 4v5c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V7l7-4z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

async function fetchTeamContext(teamId: string) {
  const detail = await fetchWebTeam(teamId);
  const manageJoin = canManageJoinRequests(detail.myRole);
  const [stats, tasks, sub, joinList, inviteList, calendarPending] = await Promise.all([
    fetchTeamMemberStats(teamId).catch(() => null),
    fetchWebTeamTasks(teamId).catch(() => []),
    fetchWebTeamSubscription(teamId).catch(() => null),
    manageJoin ? fetchTeamJoinRequests(teamId).catch(() => []) : Promise.resolve([]),
    manageJoin ? fetchTeamInvites(teamId).catch(() => []) : Promise.resolve([]),
    manageJoin ? fetchPendingCalendarEvents(teamId).catch(() => []) : Promise.resolve([]),
  ]);
  const plan = sub?.plan ?? "free";
  return {
    detail,
    memberStats: stats?.stats ?? null,
    workplaceStandards: mergeWorkplaceStandards(stats?.workplaceStandards ?? detail.workplaceStandards),
    overviewTasks: Array.isArray(tasks) ? tasks : [],
    isPaid: plan === "team" || plan === "pro",
    incoming: manageJoin ? joinList : [],
    pendingInvites: manageJoin ? inviteList : [],
    pendingCalendarEvents: manageJoin ? calendarPending : [],
  };
}

function canManageJoinRequests(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

function canRemoveMembers(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

/** Owner can manage any non-owner member; team leaders only regular members. */
function canOpenMemberRow(meRole: string, m: WebTeamMemberRow): boolean {
  if (!canRemoveMembers(meRole)) return false;
  if (m.role === "owner") return false;
  if (meRole === "team_leader" && m.role !== "member") return false;
  return true;
}

function canViewMemberProfile(meRole: string, targetUserId: string, myId: string): boolean {
  if (!myId || targetUserId === myId) return true;
  return meRole === "owner" || meRole === "team_leader";
}

function memberSort(a: WebTeamMemberRow, b: WebTeamMemberRow): number {
  return (a.user.name ?? "").localeCompare(b.user.name ?? "");
}

function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  teams: WebTeamRow[] | null;
  selectedTeamId: string;
  me: WebMeUser | null | undefined;
  onTeamsRefresh: () => Promise<void>;
  /** True while fetching a new workspace after the sidebar selection changed. */
  onWorkspaceSwitchLoading?: (busy: boolean) => void;
};

export function TeamTabPanel({ teams, selectedTeamId, me, onTeamsRefresh, onWorkspaceSwitchLoading }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const teamContextQuery = useQuery({
    queryKey: queryKeys.teamContext(selectedTeamId),
    queryFn: () => fetchTeamContext(selectedTeamId),
    enabled: !!selectedTeamId,
    refetchOnMount: false,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const teamDetail = teamContextQuery.data?.detail ?? null;
  const memberStats = teamContextQuery.data?.memberStats ?? null;
  const workplaceStandards = teamContextQuery.data?.workplaceStandards ?? mergeWorkplaceStandards(null);
  const overviewTasks = teamContextQuery.data?.overviewTasks ?? [];
  const isPaid = teamContextQuery.data?.isPaid ?? false;
  const incoming = teamContextQuery.data?.incoming ?? [];
  const pendingInvites = teamContextQuery.data?.pendingInvites ?? [];
  const pendingCalendarEvents = teamContextQuery.data?.pendingCalendarEvents ?? [];
  const loadErr =
    teamContextQuery.error instanceof Error
      ? teamContextQuery.error.message
      : teamContextQuery.isError
        ? "Could not load team."
        : null;
  const [actionErr, setActionErr] = useState<string | null>(null);
  const displayErr = actionErr ?? loadErr;
  const showInitialLoading = teamContextQuery.isPending && !teamContextQuery.data;

  const reloadTeamContext = useCallback(async () => {
    if (!selectedTeamId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.teamContext(selectedTeamId) });
  }, [queryClient, selectedTeamId]);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [pendingInvitesOpen, setPendingInvitesOpen] = useState(false);
  const [pendingCalendarOpen, setPendingCalendarOpen] = useState(false);
  const [addMemberBusy, setAddMemberBusy] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [calendarActionId, setCalendarActionId] = useState<string | null>(null);

  const [memberModal, setMemberModal] = useState<WebTeamMemberRow | null>(null);
  const [memberModalErr, setMemberModalErr] = useState<string | null>(null);
  const [rolePick, setRolePick] = useState<"member" | "team_leader">("member");
  const [modalBusy, setModalBusy] = useState(false);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [oneOneTemplatesOpen, setOneOneTemplatesOpen] = useState(false);
  const [workplaceStandardsOpen, setWorkplaceStandardsOpen] = useState(false);
  const [requiredTemplateTitle, setRequiredTemplateTitle] = useState<string | null>(
    teamDetail?.requiredCheckInTemplateTitle ?? null,
  );

  const myId = me?.id ?? "";

  useEffect(() => {
    setRequiredTemplateTitle(teamDetail?.requiredCheckInTemplateTitle ?? null);
  }, [teamDetail?.id, teamDetail?.requiredCheckInTemplateTitle]);

  useEffect(() => {
    if (!onWorkspaceSwitchLoading) return;
    onWorkspaceSwitchLoading(showInitialLoading);
    return () => {
      onWorkspaceSwitchLoading(false);
    };
  }, [showInitialLoading, onWorkspaceSwitchLoading]);

  useEffect(() => {
    if (!teamDetail || !myId) return;
    if (canViewMemberProfile(teamDetail.myRole, selectedMemberId ?? myId, myId)) return;
    setSelectedMemberId(myId);
  }, [teamDetail, myId, selectedMemberId]);

  useEffect(() => {
    if (!teamDetail || !myId) return;
    if (teamDetail.myRole === "owner" || teamDetail.myRole === "team_leader") return;
    setSelectedMemberId(myId);
  }, [teamDetail?.id, teamDetail?.myRole, myId]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);


  const sortedMembers = useMemo(() => [...(teamDetail?.members ?? [])].sort(memberSort), [teamDetail?.members]);

  useEffect(() => {
    setMemberSearch("");
  }, [selectedTeamId]);

  useEffect(() => {
    if (sortedMembers.length === 0) {
      setSelectedMemberId(null);
      return;
    }
    setSelectedMemberId((prev) => {
      if (prev && sortedMembers.some((m) => m.userId === prev)) return prev;
      return sortedMembers[0]?.userId ?? null;
    });
  }, [selectedTeamId, sortedMembers]);

  useEffect(() => {
    const member = searchParams.get("member")?.trim().toLowerCase();
    if (member !== "me" || !myId) return;
    if (!sortedMembers.some((m) => m.userId === myId)) return;
    setSelectedMemberId(myId);
    const next = new URLSearchParams(searchParams);
    next.delete("member");
    setSearchParams(next, { replace: true });
  }, [myId, searchParams, setSearchParams, sortedMembers]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return sortedMembers;
    return sortedMembers.filter((m) => {
      const name = (m.user.name ?? "").toLowerCase();
      const email = (m.user.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [memberSearch, sortedMembers]);

  const selectedMember = useMemo(
    () => sortedMembers.find((m) => m.userId === selectedMemberId) ?? null,
    [sortedMembers, selectedMemberId],
  );

  const ownerMember = useMemo(() => sortedMembers.find((m) => m.role === "owner") ?? null, [sortedMembers]);

  const openActionCount = useMemo(
    () => overviewTasks.filter((t) => t.status !== "done" && !isTaskOverdue(t, todayStart)).length,
    [overviewTasks, todayStart],
  );

  const onAddMemberByEmail = async (email: string) => {
    if (!selectedTeamId || !email.trim()) return;
    setAddMemberBusy(true);
    setAddMemberError(null);
    try {
      const result = await inviteMemberByEmail(selectedTeamId, email.trim());
      setAddMemberOpen(false);
      setAddMemberError(null);
      await reloadTeamContext();
      if (result.added) {
        await onTeamsRefresh();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not add member.";
      setAddMemberError(
        msg.includes("Not found")
          ? "Invite service is not available on this server yet. Deploy the latest backend, or use local dev with the backend running."
          : msg,
      );
    } finally {
      setAddMemberBusy(false);
    }
  };

  const openMemberModal = (m: WebTeamMemberRow) => {
    setMemberModal(m);
    setMemberModalErr(null);
    setRolePick(m.role === "team_leader" ? "team_leader" : "member");
  };

  const closeMemberModal = () => {
    if (modalBusy) return;
    setMemberModal(null);
    setMemberModalErr(null);
  };

  const onSaveRole = async () => {
    if (!selectedTeamId || !memberModal || teamDetail?.myRole !== "owner") return;
    if (memberModal.role === "owner") return;
    const currentRole = memberModal.role === "team_leader" ? "team_leader" : "member";
    if (rolePick === currentRole) {
      closeMemberModal();
      return;
    }
    setModalBusy(true);
    setMemberModalErr(null);
    try {
      await setTeamMemberRole(selectedTeamId, memberModal.userId, rolePick);
      setMemberModal(null);
      setMemberModalErr(null);
      await reloadTeamContext();
      await onTeamsRefresh();
    } catch (e) {
      setMemberModalErr(e instanceof Error ? e.message : "Could not update role.");
    } finally {
      setModalBusy(false);
    }
  };

  const onTransferOwnership = async () => {
    if (!selectedTeamId || !memberModal || teamDetail?.myRole !== "owner" || memberModal.userId === myId) return;
    if (!window.confirm(`Make ${memberModal.user.name ?? "this member"} the team owner? You will become a member.`)) return;
    setModalBusy(true);
    setMemberModalErr(null);
    try {
      await transferTeamOwnership(selectedTeamId, memberModal.userId);
      setMemberModal(null);
      setMemberModalErr(null);
      await reloadTeamContext();
      await onTeamsRefresh();
    } catch (e) {
      setMemberModalErr(e instanceof Error ? e.message : "Transfer failed.");
    } finally {
      setModalBusy(false);
    }
  };

  const onRemoveMember = async () => {
    if (!selectedTeamId || !memberModal) return;
    if (!window.confirm(`Remove ${memberModal.user.name ?? "this member"} from the team?`)) return;
    setModalBusy(true);
    setMemberModalErr(null);
    try {
      await removeTeamMemberApi(selectedTeamId, memberModal.userId);
      setMemberModal(null);
      setMemberModalErr(null);
      await reloadTeamContext();
      await onTeamsRefresh();
    } catch (e) {
      setMemberModalErr(e instanceof Error ? e.message : "Could not remove member.");
    } finally {
      setModalBusy(false);
    }
  };

  const myRole = teamDetail?.myRole ?? "";
  const manageJoin = canManageJoinRequests(myRole);
  const manageMembers = canRemoveMembers(myRole);
  const canManageOneOneTemplates = myRole === "owner";
  const showOwnerManageRow = canManageOneOneTemplates;

  if (!selectedTeamId) {
    return (
      <div className="enterprise-team-tab">
        <p className="enterprise-muted">Select a workspace from the sidebar.</p>
      </div>
    );
  }

  if (showInitialLoading) {
    return <div className="enterprise-team-tab enterprise-team-tab-loading-host" aria-busy="true" />;
  }

  if (!teamDetail) {
    return (
      <div className="enterprise-team-tab">
        <p className="enterprise-muted">{loadErr ?? "Team not found."}</p>
      </div>
    );
  }

  return (
    <div className="enterprise-team-tab enterprise-team-page">
      {displayErr ? (
        <p className="enterprise-form-error enterprise-team-page-error" role="alert">
          {displayErr}
        </p>
      ) : null}

      <div className="enterprise-team-split">
        <aside className="enterprise-team-split-list">
          <header className="enterprise-team-list-header">
            <div className="enterprise-team-list-toolbar">
              <div className="enterprise-team-list-search-wrap">
                <input
                  type="search"
                  className="enterprise-team-list-search"
                  placeholder="Search team members..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  aria-label="Search team members"
                />
                <span className="enterprise-team-list-search-icon" aria-hidden>
                  <IconSearch />
                </span>
              </div>
              {manageJoin ? (
                <>
                  {pendingInvites.length > 0 ? (
                    <button
                      type="button"
                      className="enterprise-team-pending-chip"
                      onClick={() => setPendingInvitesOpen(true)}
                      aria-label={`${pendingInvites.length} pending invite${pendingInvites.length !== 1 ? "s" : ""}`}
                    >
                      {pendingInvites.length} pending
                    </button>
                  ) : null}
                  {pendingCalendarEvents.length > 0 ? (
                    <button
                      type="button"
                      className="enterprise-team-pending-chip"
                      onClick={() => setPendingCalendarOpen(true)}
                      aria-label={`${pendingCalendarEvents.length} pending calendar request${pendingCalendarEvents.length !== 1 ? "s" : ""}`}
                    >
                      {pendingCalendarEvents.length} calendar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="enterprise-team-list-add-btn"
                    onClick={() => {
                      setAddMemberError(null);
                      setAddMemberOpen(true);
                    }}
                  >
                    + Add member
                  </button>
                </>
              ) : null}
            </div>
          </header>

          <div className={`enterprise-team-stat-row${showOwnerManageRow ? " enterprise-team-stat-row--three" : " enterprise-team-stat-row--one"}`}>
            <div className="enterprise-team-stat-card enterprise-team-stat-card--actions">
              <span className="enterprise-team-stat-icon" aria-hidden><IconStatActions /></span>
              <span className="enterprise-team-stat-copy">
                <strong>{openActionCount}</strong>
                <span>Open actions</span>
              </span>
            </div>
            {showOwnerManageRow ? (
              <button
                type="button"
                className="enterprise-team-stat-card enterprise-team-stat-card--templates enterprise-team-stat-card--action"
                onClick={() => setOneOneTemplatesOpen(true)}
              >
                <span className="enterprise-team-stat-icon enterprise-team-stat-icon--templates" aria-hidden>
                  <IconTemplateOneOne />
                </span>
                <span className="enterprise-team-stat-copy enterprise-team-stat-copy--templates">
                  <span className="enterprise-team-stat-templates-title">Check-in templates</span>
                  <span>Manage forms</span>
                </span>
                <span className="enterprise-team-stat-chevron" aria-hidden>
                  ›
                </span>
              </button>
            ) : null}
            {showOwnerManageRow ? (
              <button
                type="button"
                className="enterprise-team-stat-card enterprise-team-stat-card--standards enterprise-team-stat-card--action"
                onClick={() => setWorkplaceStandardsOpen(true)}
              >
                <span className="enterprise-team-stat-icon enterprise-team-stat-icon--standards" aria-hidden>
                  <IconWorkplaceStandards />
                </span>
                <span className="enterprise-team-stat-copy enterprise-team-stat-copy--templates">
                  <span className="enterprise-team-stat-templates-title">Workplace Standards</span>
                  <span>Manage expectations</span>
                </span>
                <span className="enterprise-team-stat-chevron" aria-hidden>
                  ›
                </span>
              </button>
            ) : null}
          </div>

          {manageJoin && incoming.length > 0 ? (
            <section className="enterprise-team-pending-panel" aria-label="Pending join requests">
              <header className="enterprise-team-pending-head">
                <span className="enterprise-team-pending-head-icon enterprise-team-pending-head-icon--request" aria-hidden>
                  <IconUserPlus />
                </span>
                <div className="enterprise-team-pending-head-copy">
                  <h3 className="enterprise-team-pending-title">Pending requests</h3>
                  <p className="enterprise-team-pending-sub">
                    {incoming.length} {incoming.length === 1 ? "person wants" : "people want"} to join
                  </p>
                </div>
              </header>
              <ul className="enterprise-team-pending-list">
                {incoming.map((req) => {
                  const name = req.user.name ?? req.user.email ?? "Someone";
                  return (
                    <li key={req.id} className="enterprise-team-pending-row">
                      <span className="enterprise-team-pending-avatar enterprise-team-pending-avatar--person">
                        {req.user.image ? (
                          <img src={req.user.image} alt={name} />
                        ) : (
                          (name[0] ?? "?").toUpperCase()
                        )}
                      </span>
                      <div className="enterprise-team-pending-main">
                        <div className="enterprise-team-pending-topline">
                          <strong className="enterprise-team-pending-email">{name}</strong>
                          <span className="enterprise-team-pending-badge enterprise-team-pending-badge--request">Join request</span>
                        </div>
                        <p className="enterprise-team-pending-meta">
                          Requested {formatInviteDate(req.createdAt)}
                          {req.user.email ? (
                            <>
                              <span className="enterprise-team-pending-dot" aria-hidden>·</span>
                              {req.user.email}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="enterprise-team-pending-actions">
                        <button
                          type="button"
                          className="enterprise-team-pending-btn enterprise-team-pending-btn-ghost"
                          onClick={async () => {
                            try {
                              await rejectTeamJoinRequest(selectedTeamId, req.id);
                              await reloadTeamContext();
                            } catch (e) {
                              setActionErr(e instanceof Error ? e.message : "Decline failed.");
                            }
                          }}
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          className="enterprise-team-pending-btn enterprise-team-pending-btn-primary"
                          onClick={async () => {
                            try {
                              await approveTeamJoinRequest(selectedTeamId, req.id);
                              await reloadTeamContext();
                              await onTeamsRefresh();
                            } catch (e) {
                              setActionErr(e instanceof Error ? e.message : "Approve failed.");
                            }
                          }}
                        >
                          Approve
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <div className="enterprise-team-roster-section">
            <div className="enterprise-team-roster-panel">
              <div className="enterprise-team-roster-head">
                <h2 className="enterprise-team-roster-title">Team members</h2>
                <label className="enterprise-team-role-filter enterprise-team-role-filter--soon">
                  <select disabled aria-label="Filter by role">
                    <option>All roles</option>
                  </select>
                </label>
              </div>

              <div className="enterprise-team-roster-standards-bar">
                <span className="enterprise-team-roster-standards-bar-icon" aria-hidden>
                  <IconWorkplaceStandards />
                </span>
                <div className="enterprise-team-roster-standards-bar-copy">
                  <p className="enterprise-team-roster-standards-kicker">
                    <span>Workplace standards</span>
                    <StandardsStatusKey />
                  </p>
                  <p className="enterprise-team-roster-standards-line">
                    {workplaceStandards.checkInRequired ? (
                      <span>
                        Check-ins: {formatCheckInFrequencySummary(workplaceStandards)} ·{" "}
                        {formatDueSoonThresholdSummary(workplaceStandards)}
                      </span>
                    ) : (
                      <span>Check-ins: Not required</span>
                    )}
                  </p>
                  <p className="enterprise-team-roster-standards-line">
                    Goals:{" "}
                    {workplaceStandards.goalsRequired && workplaceStandards.minimumActiveGoals > 0
                      ? `${workplaceStandards.minimumActiveGoals} active goal${workplaceStandards.minimumActiveGoals === 1 ? "" : "s"} required`
                      : "Optional"}
                  </p>
                </div>
                {showOwnerManageRow ? (
                  <button
                    type="button"
                    className="enterprise-team-roster-standards-manage"
                    onClick={() => setWorkplaceStandardsOpen(true)}
                  >
                    Manage Standards
                  </button>
                ) : null}
              </div>

              <div className="enterprise-team-roster-table">
                <div className="enterprise-team-roster-table-head" aria-hidden>
                  <span>Member</span>
                  <span>Check-in</span>
                  <span>Goals</span>
                  <span>Overall</span>
                  <span className="enterprise-team-roster-table-head-spacer" />
                </div>

                <ul className="enterprise-team-roster">
                  {filteredMembers.map((m) => {
                    const isSelf = m.userId === myId;
                    const isSelected = m.userId === selectedMemberId;
                    const canView = canViewMemberProfile(myRole, m.userId, myId);
                    const displayName = m.user.name ?? m.user.email ?? "Member";
                    const stats = memberStats?.[m.userId];
                    const statsReady = memberStats !== null;
                    const daysSinceCheckIn = stats?.daysSinceLastOneOnOne;
                    const compliance = stats?.standardsCompliance;
                    const activeGoals = stats?.activeDevGoals ?? 0;
                    const checkIn = statsReady
                      ? rosterCheckInColumn(compliance, daysSinceCheckIn, workplaceStandards)
                      : null;
                    const goals = statsReady ? rosterGoalsColumn(workplaceStandards, activeGoals) : null;
                    const overall = statsReady
                      ? rosterOverallStatus(compliance, daysSinceCheckIn, workplaceStandards, activeGoals)
                      : null;
                    const cardClass = `enterprise-team-roster-card${isSelected ? " enterprise-team-roster-card--selected" : ""}${isSelf ? " enterprise-team-roster-card--self" : ""}${!canView ? " enterprise-team-roster-card--static" : ""}`;
                    const cardBody = (
                      <>
                        <span className="enterprise-team-roster-col enterprise-team-roster-col--member">
                          <span className="enterprise-team-roster-avatar">
                            {m.user.image ? (
                              <img src={m.user.image} alt={displayName} />
                            ) : (
                              (m.user.name?.[0] ?? m.user.email?.[0] ?? "?").toUpperCase()
                            )}
                          </span>
                          <span className="enterprise-team-roster-member-copy">
                            <span className="enterprise-team-roster-headline">
                              <span className="enterprise-team-roster-name">
                                {displayName}
                                {isSelf ? " (you)" : ""}
                              </span>
                              <span className={rolePillClass(m.role)}>{roleLabel(m.role)}</span>
                            </span>
                          </span>
                        </span>

                        <span className="enterprise-team-roster-col enterprise-team-roster-col--check-in">
                          {checkIn ? (
                            <RosterMetricCell tone={checkIn.tone} primary={checkIn.primary} />
                          ) : (
                            <span className="enterprise-team-roster-metric-cell">…</span>
                          )}
                        </span>

                        <span className="enterprise-team-roster-col enterprise-team-roster-col--goals">
                          {goals ? (
                            <RosterMetricCell tone={goals.tone} primary={goals.primary} icon="none" />
                          ) : (
                            <span className="enterprise-team-roster-metric-cell">…</span>
                          )}
                        </span>

                        <span className="enterprise-team-roster-col enterprise-team-roster-col--overall">
                          {overall ? (
                            <span className={`enterprise-team-roster-overall enterprise-team-roster-overall--${overall.tone}`}>
                              <RosterOverallIcon tone={overall.tone} label={overall.label} />
                              <span>{overall.label}</span>
                            </span>
                          ) : (
                            <span className="enterprise-team-roster-metric-cell">…</span>
                          )}
                        </span>

                        {canView ? (
                          <span className="enterprise-team-roster-chevron" aria-hidden>
                            ›
                          </span>
                        ) : (
                          <span className="enterprise-team-roster-lock" title="You don't have access to this member's profile" aria-label="Profile locked">
                            <IconLock />
                          </span>
                        )}
                      </>
                    );
                    return (
                      <li key={m.id}>
                        {canView ? (
                          <button
                            type="button"
                            className={cardClass}
                            onClick={() => setSelectedMemberId(m.userId)}
                            data-testid={`team-roster-member-${m.userId}`}
                          >
                            {cardBody}
                          </button>
                        ) : (
                          <div className={cardClass} data-testid={`team-roster-member-${m.userId}`}>
                            {cardBody}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <RosterStatusLegend />
            </div>
          </div>
        </aside>

        <main className="enterprise-team-split-detail">
          {selectedMember && canViewMemberProfile(myRole, selectedMember.userId, myId) ? (
            <TeamMemberProfilePanel
              key={selectedMember.userId}
              teamId={teamDetail.id}
              member={selectedMember}
              isSelf={selectedMember.userId === myId}
              managerName={ownerMember?.user.name ?? ownerMember?.user.email ?? null}
              leaderUserId={ownerMember?.userId ?? null}
              roleLabel={roleLabel(selectedMember.role)}
              roleBadgeClass={roleBadgeClass(selectedMember.role)}
              canManage={canOpenMemberRow(myRole, selectedMember)}
              canCreateOneOne={myRole === "owner" || myRole === "team_leader"}
              canCreateDevGoal={
                selectedMember.userId === myId ||
                myRole === "owner" ||
                myRole === "team_leader" ||
                myRole === "admin"
              }
              canAddDevNotes={
                selectedMember.userId === myId ||
                myRole === "owner" ||
                myRole === "team_leader" ||
                myRole === "admin"
              }
              streak={isPaid ? memberStats?.[selectedMember.userId]?.streak : undefined}
              overdueFollowUpTasks={memberStats?.[selectedMember.userId]?.overdueFollowUpTasks}
              workplaceStandards={workplaceStandards}
              standardsCompliance={memberStats?.[selectedMember.userId]?.standardsCompliance}
              canManageStandards={canManageOneOneTemplates}
              onManageStandards={() => setWorkplaceStandardsOpen(true)}
              onBack={() => setSelectedMemberId(null)}
              onManage={() => openMemberModal(selectedMember)}
            />
          ) : (
            <div className="enterprise-team-profile-empty">
              <h2>Select a team member</h2>
              <p className="enterprise-muted">Choose someone from the list to view their profile.</p>
            </div>
          )}
        </main>
      </div>

      <AddMemberModal
        open={addMemberOpen}
        teamId={selectedTeamId}
        teamName={teamDetail.name}
        confirming={addMemberBusy}
        error={addMemberError}
        onClose={() => {
          setAddMemberError(null);
          setAddMemberOpen(false);
        }}
        onClearError={() => setAddMemberError(null)}
        onConfirm={(email) => void onAddMemberByEmail(email)}
      />

      <PendingInvitesModal
        open={pendingInvitesOpen}
        teamId={selectedTeamId}
        invites={pendingInvites}
        inviteActionId={inviteActionId}
        onClose={() => setPendingInvitesOpen(false)}
        onReload={reloadTeamContext}
        onError={(message) => setActionErr(message)}
        onInviteActionStart={setInviteActionId}
        onInviteActionEnd={() => setInviteActionId(null)}
      />

      <PendingCalendarEventsModal
        open={pendingCalendarOpen}
        teamId={selectedTeamId}
        events={pendingCalendarEvents}
        actionId={calendarActionId}
        onClose={() => setPendingCalendarOpen(false)}
        onReload={async () => {
          await reloadTeamContext();
          await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedTeamId) });
          await queryClient.invalidateQueries({ queryKey: queryKeys.pendingCalendarEvents(selectedTeamId) });
        }}
        onError={(message) => setActionErr(message)}
        onActionStart={setCalendarActionId}
        onActionEnd={() => setCalendarActionId(null)}
      />

      {memberModal && teamDetail ? (
        <TeamMemberManageModal
          member={memberModal}
          myRole={teamDetail.myRole}
          myId={myId}
          manageMembers={manageMembers}
          rolePick={rolePick}
          busy={modalBusy}
          error={memberModalErr}
          onRolePickChange={setRolePick}
          onClose={closeMemberModal}
          onSaveRole={() => void onSaveRole()}
          onTransferOwnership={() => void onTransferOwnership()}
          onRemoveMember={() => void onRemoveMember()}
        />
      ) : null}

      <OneOnOneTemplatesModal
        teamId={teamDetail.id}
        open={oneOneTemplatesOpen}
        onClose={() => setOneOneTemplatesOpen(false)}
      />

      <WorkplaceStandardsModal
        teamId={teamDetail.id}
        open={workplaceStandardsOpen}
        initialStandards={workplaceStandards}
        initialTemplateTitle={requiredTemplateTitle}
        onClose={() => setWorkplaceStandardsOpen(false)}
        onSaved={(_saved, templateTitle) => {
          setRequiredTemplateTitle(templateTitle);
          void reloadTeamContext();
        }}
      />
    </div>
  );
}
