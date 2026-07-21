import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { queryKeys } from "../lib/query-keys";
import { AddMemberModal } from "./AddMemberModal";
import { AlenioWorkspaceLoading } from "./AlenioWorkspaceLoading";
import { PendingInvitesModal } from "./PendingInvitesModal";
import { PendingCalendarEventsModal } from "./PendingCalendarEventsModal";
import { TeamMemberManageModal } from "./TeamMemberManageModal";
import { TeamMemberProfilePanel } from "./TeamMemberProfilePanel";
import { OneOnOneTemplatesModal } from "./OneOnOneTemplatesModal";
import { WorkplaceStandardsModal, mergeWorkplaceStandards } from "./WorkplaceStandardsModal";
import { StandardsStatusKey } from "./StandardsStatusKey";
import { UserAvatar } from "./UserAvatar";
import { isRecentFooterEnterpriseWorkspaceSelect } from "../lib/enterprise-selected-team";
import { useEnterprisePaneActive } from "../routes/EnterpriseKeepAliveOutlet";
import {
  approveTeamJoinRequest,
  fetchPendingCalendarEvents,
  fetchTeamInvites,
  fetchTeamJoinRequests,
  fetchTeamMemberStats,
  fetchWebTeam,
  fetchWebTeamSubscription,
  fetchFormerWorkspaceMembers,
  inviteMemberByEmail,
  rejectTeamJoinRequest,
  removeTeamMemberApi,
  setTeamMemberRole,
  transferTeamOwnership,
  type TeamMemberStatsMap,
  type WebMeUser,
  type WebTeamDetail,
  type WebFormerMemberRow,
  type WebTeamInvite,
  type WebTeamJoinRequest,
  type WebTeamMemberRow,
  type WebTeamRow,
} from "../lib/api";
import {
  checkInDueSoonStartDays,
  formatCheckInFrequencySummary,
  frequencyToDays,
  type MemberStandardsCompliance,
  type WorkplaceStandards,
} from "../lib/workplace-standards";

function roleLabel(role: string): string {
  if (role === "owner") return "Workspace owner";
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

function formatDaysSinceLastCheckIn(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
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
  if (daysSinceCheckIn == null) {
    return { tone: "bad", primary: "No check-in" };
  }

  if (compliance.checkInStatus === "on_track") {
    return { tone: "ok", primary: formatDaysSinceLastCheckIn(daysSinceCheckIn) };
  }
  if (compliance.checkInStatus === "due_soon") {
    if (daysSinceCheckIn === 0) return { tone: "warn", primary: "Due today" };
    return { tone: "warn", primary: formatDaysSinceLastCheckIn(daysSinceCheckIn) };
  }
  if (compliance.checkInStatus === "overdue") {
    if (daysSinceCheckIn <= 0) return { tone: "bad", primary: "Overdue" };
    return {
      tone: "bad",
      primary: daysSinceCheckIn === 1 ? "1 day overdue" : `${daysSinceCheckIn} days overdue`,
    };
  }
  return { tone: "muted", primary: formatDaysSinceLastCheckIn(daysSinceCheckIn) };
}

function rosterStandardsSummary(standards: WorkplaceStandards): string {
  const parts: string[] = [];
  if (standards.checkInRequired) {
    parts.push(formatCheckInFrequencySummary(standards));
    const frequencyDays = frequencyToDays(standards.checkInFrequencyValue, standards.checkInFrequencyUnit);
    const dueSoonAt = checkInDueSoonStartDays(frequencyDays);
    parts.push(dueSoonAt === 1 ? "Due soon at 1 day" : `Due soon at ${dueSoonAt} days`);
  } else {
    parts.push("Check-ins optional");
  }
  if (standards.goalsRequired && standards.minimumActiveGoals > 0) {
    const min = standards.minimumActiveGoals;
    parts.push(`${min} goal${min === 1 ? "" : "s"} required`);
  } else {
    parts.push("Goals optional");
  }
  return parts.join(" · ");
}

function rosterGoalsColumn(
  standards: WorkplaceStandards,
  activeGoals: number,
): { tone: RosterTone; primary: string } {
  if (!standards.goalsRequired || standards.minimumActiveGoals <= 0) {
    if (activeGoals <= 0) return { tone: "muted", primary: "No goals" };
    return { tone: "ok", primary: String(activeGoals) };
  }
  if (activeGoals <= 0) return { tone: "bad", primary: "No goals" };
  const min = standards.minimumActiveGoals;
  return {
    tone: activeGoals >= min ? "ok" : "bad",
    primary: String(activeGoals),
  };
}

function rosterOverallStatus(
  compliance: MemberStandardsCompliance | undefined,
  daysSinceCheckIn: number | null | undefined,
  standards: WorkplaceStandards,
  activeGoals: number,
): { tone: RosterTone; label: string } {
  if (!compliance) return { tone: "muted", label: "—" };

  const noInitialCheckIn =
    standards.checkInRequired &&
    compliance.checkInStatus === "overdue" &&
    daysSinceCheckIn == null;
  const missingGoals =
    standards.goalsRequired &&
    standards.minimumActiveGoals > 0 &&
    activeGoals < standards.minimumActiveGoals;

  if (noInitialCheckIn && missingGoals) {
    return { tone: "bad", label: "Overdue" };
  }

  if (standards.checkInRequired) {
    if (noInitialCheckIn) {
      return { tone: "bad", label: "Overdue" };
    }
    if (compliance.checkInStatus === "overdue") {
      return { tone: "bad", label: "Overdue" };
    }
    if (compliance.checkInStatus === "due_soon") {
      return { tone: "warn", label: "Due soon" };
    }
  }

  if (missingGoals) {
    return { tone: "warn", label: "Needs goals" };
  }

  if (!standards.checkInRequired && !standards.goalsRequired) {
    return { tone: "muted", label: "—" };
  }

  return { tone: "ok", label: "On track" };
}

function IconRosterCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
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

function IconUsers({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconChevronDown({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
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

async function fetchTeamCore(teamId: string, shellRole: string | undefined) {
  const manageJoinHint = shellRole ? canManageJoinRequests(shellRole) : true;
  const [detail, sub, joinList, inviteList, calendarPending, formerMembers] = await Promise.all([
    fetchWebTeam(teamId),
    fetchWebTeamSubscription(teamId).catch(() => null),
    manageJoinHint ? fetchTeamJoinRequests(teamId).catch(() => []) : Promise.resolve([]),
    manageJoinHint ? fetchTeamInvites(teamId).catch(() => []) : Promise.resolve([]),
    manageJoinHint ? fetchPendingCalendarEvents(teamId).catch(() => []) : Promise.resolve([]),
    manageJoinHint ? fetchFormerWorkspaceMembers(teamId).catch(() => []) : Promise.resolve([]),
  ]);
  const manageJoin = canManageJoinRequests(detail.myRole);
  // If shell role was incomplete, fetch admin lists after detail resolves.
  let incoming = manageJoin ? joinList : [];
  let pendingInvites = manageJoin ? inviteList : [];
  let pendingCalendarEvents = manageJoin ? calendarPending : [];
  let formers = manageJoin ? (Array.isArray(formerMembers) ? formerMembers : []) : [];
  if (manageJoin && !manageJoinHint) {
    const [j, i, c, f] = await Promise.all([
      fetchTeamJoinRequests(teamId).catch(() => []),
      fetchTeamInvites(teamId).catch(() => []),
      fetchPendingCalendarEvents(teamId).catch(() => []),
      fetchFormerWorkspaceMembers(teamId).catch(() => []),
    ]);
    incoming = j;
    pendingInvites = i;
    pendingCalendarEvents = c;
    formers = Array.isArray(f) ? f : [];
  }
  const plan = sub?.plan ?? "free";
  return {
    detail,
    workplaceStandards: mergeWorkplaceStandards(detail.workplaceStandards),
    isPaid: plan === "team" || plan === "pro" || plan === "operations",
    incoming,
    pendingInvites,
    pendingCalendarEvents,
    formerMembers: formers,
  };
}

async function fetchTeamEnrichment(teamId: string) {
  const stats = await fetchTeamMemberStats(teamId).catch(() => null);
  return {
    memberStats: stats?.stats ?? null,
    workplaceStandards: stats?.workplaceStandards ? mergeWorkplaceStandards(stats.workplaceStandards) : null,
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

function canViewMemberProfile(
  meRole: string,
  targetUserId: string,
  myId: string,
  targetRole: string,
): boolean {
  if (!myId || targetUserId === myId) return true;
  if (targetRole === "owner") return false;
  return meRole === "owner" || meRole === "team_leader";
}

function memberSort(a: WebTeamMemberRow, b: WebTeamMemberRow, myId: string): number {
  if (a.userId === myId && b.userId !== myId) return -1;
  if (b.userId === myId && a.userId !== myId) return 1;
  return (a.user.name ?? "").localeCompare(b.user.name ?? "");
}

/** Prefer live account photo for the signed-in user when roster data is stale/empty. */
function withLiveProfilePhoto(m: WebTeamMemberRow, me: WebMeUser | null | undefined): WebTeamMemberRow {
  if (!me?.image || m.userId !== me.id) return m;
  if (m.user.image === me.image) return m;
  return { ...m, user: { ...m.user, image: me.image } };
}

function formerToMemberRow(former: WebFormerMemberRow): WebTeamMemberRow {
  return {
    id: `former-${former.userId}`,
    userId: former.userId,
    role: "member",
    user: {
      id: former.user.id,
      name: former.user.name,
      email: former.user.email,
      image: former.user.image,
    },
  };
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
  const paneActive = useEnterprisePaneActive();
  const shellRole = teams?.find((t) => t.id === selectedTeamId)?.role;
  const prevTeamIdRef = useRef(selectedTeamId);

  const teamCoreQuery = useQuery({
    queryKey: queryKeys.teamContext(selectedTeamId),
    queryFn: () => fetchTeamCore(selectedTeamId, shellRole),
    enabled: !!selectedTeamId,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const teamEnrichmentQuery = useQuery({
    queryKey: [...queryKeys.teamContext(selectedTeamId), "enrichment"] as const,
    queryFn: () => fetchTeamEnrichment(selectedTeamId),
    enabled: !!selectedTeamId && !!teamCoreQuery.data,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const detail = teamCoreQuery.data?.detail;
    if (!detail || !selectedTeamId) return;
    queryClient.setQueryData(queryKeys.teamDetail(selectedTeamId), detail);
  }, [teamCoreQuery.data?.detail, selectedTeamId, queryClient]);

  const teamDetail = teamCoreQuery.data?.detail ?? null;
  const memberStats = teamEnrichmentQuery.data?.memberStats ?? null;
  const workplaceStandards =
    teamEnrichmentQuery.data?.workplaceStandards ??
    teamCoreQuery.data?.workplaceStandards ??
    mergeWorkplaceStandards(null);
  const isPaid = teamCoreQuery.data?.isPaid ?? false;
  void isPaid;
  const incoming = teamCoreQuery.data?.incoming ?? [];
  const pendingInvites = teamCoreQuery.data?.pendingInvites ?? [];
  const pendingCalendarEvents = teamCoreQuery.data?.pendingCalendarEvents ?? [];
  const formerMembers = teamCoreQuery.data?.formerMembers ?? [];
  const loadErr =
    teamCoreQuery.error instanceof Error
      ? teamCoreQuery.error.message
      : teamCoreQuery.isError
        ? "Could not load team."
        : null;
  const [actionErr, setActionErr] = useState<string | null>(null);
  const displayErr = actionErr ?? loadErr;
  const showInitialLoading = paneActive && teamCoreQuery.isPending && !teamCoreQuery.data;

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
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [rosterDrawerOpen, setRosterDrawerOpen] = useState(false);
  const memberPickerRef = useRef<HTMLDivElement>(null);
  const consumedMemberMeParamRef = useRef(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "owner" | "team_leader" | "admin" | "member">("all");
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
    const teamChanged = prevTeamIdRef.current !== selectedTeamId;
    prevTeamIdRef.current = selectedTeamId;
    const workspaceSwitch = teamChanged || isRecentFooterEnterpriseWorkspaceSelect();
    onWorkspaceSwitchLoading(Boolean(showInitialLoading && workspaceSwitch && paneActive));
    return () => {
      onWorkspaceSwitchLoading(false);
    };
  }, [showInitialLoading, onWorkspaceSwitchLoading, selectedTeamId, paneActive]);

  const sortedMembers = useMemo(
    () =>
      [...(teamDetail?.members ?? [])]
        .map((m) => withLiveProfilePhoto(m, me))
        .sort((a, b) => memberSort(a, b, myId)),
    [teamDetail?.members, myId, me],
  );

  useEffect(() => {
    if (!teamDetail || !myId || !selectedMemberId) return;
    const selected = sortedMembers.find((m) => m.userId === selectedMemberId);
    if (selected) {
      if (canViewMemberProfile(teamDetail.myRole, selected.userId, myId, selected.role)) return;
      setSelectedMemberId(myId);
      return;
    }
    const former = formerMembers.find((f) => f.userId === selectedMemberId);
    if (former && canManageJoinRequests(teamDetail.myRole)) return;
    if (former) setSelectedMemberId(myId);
  }, [teamDetail, myId, selectedMemberId, sortedMembers, formerMembers]);

  useEffect(() => {
    if (!teamDetail || !myId) return;
    if (teamDetail.myRole === "member") {
      setSelectedMemberId(myId);
      return;
    }
    if (teamDetail.myRole === "owner" || teamDetail.myRole === "team_leader") return;
    setSelectedMemberId(myId);
  }, [teamDetail?.id, teamDetail?.myRole, myId]);


  useEffect(() => {
    setMemberSearch("");
    setMemberPickerOpen(false);
    setRosterDrawerOpen(false);
  }, [selectedTeamId]);

  useEffect(() => {
    if (!rosterDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRosterDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [rosterDrawerOpen]);

  function selectTeamMember(userId: string) {
    setSelectedMemberId(userId);
    setMemberPickerOpen(false);
    setRosterDrawerOpen(false);
  }

  useEffect(() => {
    if (!memberPickerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (memberPickerRef.current?.contains(e.target as Node)) return;
      setMemberPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [memberPickerOpen]);

  useEffect(() => {
    if (teamDetail?.myRole === "member" && myId) {
      setSelectedMemberId(myId);
      return;
    }
    if (sortedMembers.length === 0 && formerMembers.length === 0) {
      setSelectedMemberId(null);
      return;
    }
    setSelectedMemberId((prev) => {
      if (prev && sortedMembers.some((m) => m.userId === prev)) return prev;
      if (prev && formerMembers.some((f) => f.userId === prev)) return prev;
      return sortedMembers[0]?.userId ?? formerMembers[0]?.userId ?? null;
    });
  }, [selectedTeamId, sortedMembers, formerMembers, teamDetail?.myRole, myId]);

  useEffect(() => {
    if (!paneActive) return;
    const member = searchParams.get("member")?.trim().toLowerCase();
    if (member !== "me") {
      consumedMemberMeParamRef.current = false;
      return;
    }
    if (consumedMemberMeParamRef.current || !myId) return;
    if (!sortedMembers.some((m) => m.userId === myId)) return;
    consumedMemberMeParamRef.current = true;
    setSelectedMemberId(myId);
    const next = new URLSearchParams(searchParams);
    next.delete("member");
    setSearchParams(next, { replace: true });
  }, [paneActive, myId, searchParams, setSearchParams, sortedMembers]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return sortedMembers.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (!q) return true;
      const name = (m.user.name ?? "").toLowerCase();
      const email = (m.user.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [memberSearch, roleFilter, sortedMembers]);

  const selectedMember = useMemo(
    () => sortedMembers.find((m) => m.userId === selectedMemberId) ?? null,
    [sortedMembers, selectedMemberId],
  );

  const selectedFormerMember = useMemo(
    () => formerMembers.find((f) => f.userId === selectedMemberId) ?? null,
    [formerMembers, selectedMemberId],
  );

  const profileMember = useMemo(
    () => selectedMember ?? (selectedFormerMember ? formerToMemberRow(selectedFormerMember) : null),
    [selectedMember, selectedFormerMember],
  );

  const isFormerMemberProfile = !!selectedFormerMember;

  const ownerMember = useMemo(() => sortedMembers.find((m) => m.role === "owner") ?? null, [sortedMembers]);

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
  const isRegularMember = myRole === "member";

  if (!selectedTeamId) {
    return (
      <div className="enterprise-team-tab">
        <p className="enterprise-muted">Select a workspace from the sidebar.</p>
      </div>
    );
  }

  if (showInitialLoading) {
    return (
      <div className="enterprise-team-tab enterprise-team-tab-loading-host" aria-busy="true">
        <AlenioWorkspaceLoading label="Loading team" />
      </div>
    );
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

      <div
        className={[
          "enterprise-team-split",
          rosterDrawerOpen ? "enterprise-team-split--roster-open" : "",
          isRegularMember ? "enterprise-team-split--member-self" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {!isRegularMember && rosterDrawerOpen ? (
          <button
            type="button"
            className="enterprise-team-roster-backdrop"
            aria-label="Close team members"
            onClick={() => setRosterDrawerOpen(false)}
          />
        ) : null}
        {!isRegularMember ? (
          <button
            type="button"
            className={`enterprise-team-roster-tab${rosterDrawerOpen ? " enterprise-team-roster-tab--open" : ""}`}
            aria-expanded={rosterDrawerOpen}
            aria-controls="enterprise-team-roster-drawer"
            title={rosterDrawerOpen ? "Close team members" : "Open team members"}
            onClick={() => setRosterDrawerOpen((open) => !open)}
          >
            <span className="enterprise-team-roster-tab-icon" aria-hidden>
              <IconUsers />
            </span>
            <span className="enterprise-team-roster-tab-label">Team</span>
          </button>
        ) : null}
        {!isRegularMember ? (
        <aside className="enterprise-team-split-list" id="enterprise-team-roster-drawer">
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

          {showOwnerManageRow ? (
            <div className="enterprise-team-stat-row enterprise-team-stat-row--two">
              <button
                type="button"
                className="enterprise-team-stat-card enterprise-team-stat-card--templates enterprise-team-stat-card--action"
                onClick={() => setOneOneTemplatesOpen(true)}
                aria-label="Check-in templates"
                title="Check-in templates"
              >
                <span className="enterprise-team-stat-icon enterprise-team-stat-icon--templates" aria-hidden>
                  <IconTemplateOneOne />
                </span>
                <span className="enterprise-team-stat-copy enterprise-team-stat-copy--stat">
                  <span className="enterprise-team-stat-title">Templates</span>
                  <span className="enterprise-team-stat-sub">Check-ins</span>
                </span>
              </button>
              <button
                type="button"
                className="enterprise-team-stat-card enterprise-team-stat-card--standards enterprise-team-stat-card--action"
                onClick={() => setWorkplaceStandardsOpen(true)}
                aria-label="Workplace Standards"
                title="Workplace Standards"
              >
                <span className="enterprise-team-stat-icon enterprise-team-stat-icon--standards" aria-hidden>
                  <IconWorkplaceStandards />
                </span>
                <span className="enterprise-team-stat-copy enterprise-team-stat-copy--stat">
                  <span className="enterprise-team-stat-title">Standards</span>
                  <span className="enterprise-team-stat-sub">Workplace</span>
                </span>
              </button>
            </div>
          ) : null}

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
                      <UserAvatar
                        user={req.user}
                        className="enterprise-team-pending-avatar enterprise-team-pending-avatar--person"
                        alt={name}
                      />
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
            <div
              className={`enterprise-team-associates-picker${memberPickerOpen ? " enterprise-team-associates-picker--open" : ""}`}
              ref={memberPickerRef}
            >
              <div className="enterprise-team-associates-picker-head">
                <p className="enterprise-team-associates-label">Associates</p>
                <span className="enterprise-team-associates-count">{filteredMembers.length}</span>
              </div>
              <button
                type="button"
                className="enterprise-team-associates-trigger"
                aria-expanded={memberPickerOpen}
                aria-haspopup="listbox"
                onClick={() => setMemberPickerOpen((open) => !open)}
              >
                {profileMember ? (
                  <>
                    <UserAvatar
                      user={profileMember.user}
                      className="enterprise-team-associates-avatar"
                      alt={profileMember.user.name ?? profileMember.user.email ?? "Member"}
                    />
                    <span className="enterprise-team-associates-trigger-copy">
                      <span className="enterprise-team-associates-trigger-name">
                        {profileMember.user.name ?? profileMember.user.email ?? "Member"}
                        {profileMember.userId === myId ? " (you)" : ""}
                      </span>
                      <span className="enterprise-team-associates-trigger-role">
                        {isFormerMemberProfile ? "Former member" : roleLabel(profileMember.role)}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="enterprise-team-associates-trigger-copy">
                    <span className="enterprise-team-associates-trigger-name">Select a member</span>
                    <span className="enterprise-team-associates-trigger-role">Team roster</span>
                  </span>
                )}
                <span className="enterprise-team-associates-chevron" aria-hidden>
                  <IconChevronDown />
                </span>
              </button>
              {memberPickerOpen ? (
                <div className="enterprise-team-associates-menu" role="listbox" aria-label="Team associates">
                  <div className="enterprise-team-associates-menu-search">
                    <IconSearch size={16} />
                    <input
                      type="search"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search associates…"
                      aria-label="Search associates"
                      autoFocus
                    />
                  </div>
                  <ul className="enterprise-team-associates-menu-list">
                    {filteredMembers.map((m) => {
                      const isSelf = m.userId === myId;
                      const isSelected = m.userId === selectedMemberId;
                      const canView = canViewMemberProfile(myRole, m.userId, myId, m.role);
                      const displayName = m.user.name ?? m.user.email ?? "Member";
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`enterprise-team-associates-option${isSelected ? " enterprise-team-associates-option--selected" : ""}${!canView ? " enterprise-team-associates-option--locked" : ""}`}
                            disabled={!canView}
                            onClick={() => {
                              if (!canView) return;
                              selectTeamMember(m.userId);
                            }}
                          >
                            <UserAvatar user={m.user} className="enterprise-team-associates-avatar" alt={displayName} />
                            <span className="enterprise-team-associates-option-copy">
                              <span className="enterprise-team-associates-option-name">
                                {displayName}
                                {isSelf ? " (you)" : ""}
                              </span>
                              <span className="enterprise-team-associates-option-role">{roleLabel(m.role)}</span>
                            </span>
                            {!canView ? (
                              <span className="enterprise-team-associates-lock" aria-hidden>
                                <IconLock />
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                    {manageMembers && formerMembers.length > 0 ? (
                      <>
                        <li className="enterprise-team-associates-divider" aria-hidden>
                          Former members
                        </li>
                        {formerMembers.map((former) => {
                          const isSelected = former.userId === selectedMemberId;
                          const displayName = former.user.name ?? former.user.email ?? "Member";
                          return (
                            <li key={former.userId}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={`enterprise-team-associates-option${isSelected ? " enterprise-team-associates-option--selected" : ""}`}
                                onClick={() => selectTeamMember(former.userId)}
                              >
                                <UserAvatar
                                  user={former.user}
                                  className="enterprise-team-associates-avatar"
                                  alt={displayName}
                                />
                                <span className="enterprise-team-associates-option-copy">
                                  <span className="enterprise-team-associates-option-name">{displayName}</span>
                                  <span className="enterprise-team-associates-option-role">Former member</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </>
                    ) : null}
                    {filteredMembers.length === 0 && formerMembers.length === 0 ? (
                      <li className="enterprise-team-associates-empty">No associates found</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="enterprise-team-roster-panel">
              <div className="enterprise-team-roster-head">
                <div className="enterprise-team-roster-head-copy">
                  <h2 className="enterprise-team-roster-title">Team Members</h2>
                  <span className="enterprise-team-roster-count">{filteredMembers.length}</span>
                </div>
                <label className="enterprise-team-role-filter">
                  <span className="enterprise-sr-only">Filter by role</span>
                  <select
                    aria-label="Filter by role"
                    value={roleFilter}
                    onChange={(e) =>
                      setRoleFilter(e.target.value as "all" | "owner" | "team_leader" | "admin" | "member")
                    }
                  >
                    <option value="all">All roles</option>
                    <option value="owner">Owner</option>
                    <option value="team_leader">Team Leader</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                </label>
              </div>

              <div className="enterprise-team-roster-standards-bar">
                <div className="enterprise-team-roster-standards-bar-copy">
                  <p className="enterprise-team-roster-standards-kicker">
                    <span className="enterprise-team-roster-standards-bar-icon" aria-hidden>
                      <IconWorkplaceStandards />
                    </span>
                    <span>Standards</span>
                    <StandardsStatusKey />
                  </p>
                  <p className="enterprise-team-roster-standards-line">{rosterStandardsSummary(workplaceStandards)}</p>
                </div>
                {showOwnerManageRow ? (
                  <button
                    type="button"
                    className="enterprise-team-roster-standards-manage"
                    onClick={() => setWorkplaceStandardsOpen(true)}
                  >
                    Manage
                  </button>
                ) : null}
              </div>

              <div className="enterprise-team-roster-table enterprise-team-roster-table--list">
                <ul className="enterprise-team-roster enterprise-team-roster--list">
                  {filteredMembers.map((m) => {
                    const isSelf = m.userId === myId;
                    const isSelected = m.userId === selectedMemberId;
                    const canView = canViewMemberProfile(myRole, m.userId, myId, m.role);
                    const displayName = m.user.name ?? m.user.email ?? "Member";
                    const stats = memberStats?.[m.userId];
                    const statsReady = memberStats !== null;
                    const daysSinceCheckIn = stats?.daysSinceLastOneOnOne;
                    const compliance = stats?.standardsCompliance;
                    const activeGoals = stats?.activeDevGoals ?? 0;
                    const overall = statsReady
                      ? rosterOverallStatus(compliance, daysSinceCheckIn, workplaceStandards, activeGoals)
                      : null;
                    const cardClass = `enterprise-team-roster-card enterprise-team-roster-card--list${isSelected ? " enterprise-team-roster-card--selected" : ""}${isSelf ? " enterprise-team-roster-card--self" : ""}${!canView ? " enterprise-team-roster-card--static" : ""}`;
                    const cardBody = (
                      <>
                        <UserAvatar
                          user={m.user}
                          className="enterprise-team-roster-avatar"
                          alt={displayName}
                        />
                        <span className="enterprise-team-roster-member-copy">
                          <span className="enterprise-team-roster-name">
                            {displayName}
                            {isSelf ? " (you)" : ""}
                          </span>
                          <span className="enterprise-team-roster-role-line">
                            <span>{roleLabel(m.role)}</span>
                            {m.role === "owner" || m.role === "team_leader" || m.role === "admin" ? (
                              <span className={rolePillClass(m.role)}>
                                {m.role === "owner" ? "Owner" : m.role === "team_leader" ? "Leader" : "Admin"}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        {canView && overall ? (
                          <span
                            className={`enterprise-team-roster-status-end enterprise-team-roster-status-end--${overall.tone}`}
                            title={overall.label}
                          >
                            <span
                              className={`enterprise-team-roster-status-dot enterprise-team-roster-status-dot--${overall.tone}`}
                              aria-hidden
                            />
                            <span className="enterprise-team-roster-status-label">{overall.label}</span>
                          </span>
                        ) : canView ? (
                          <span className="enterprise-team-roster-status-dot enterprise-team-roster-status-dot--muted" aria-hidden />
                        ) : (
                          <span className="enterprise-team-roster-lock" title="Locked" aria-label="Member activity locked">
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
                            onClick={() => selectTeamMember(m.userId)}
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

                {manageMembers && formerMembers.length > 0 ? (
                  <div className="enterprise-team-roster-former">
                    <button
                      type="button"
                      className="enterprise-team-roster-archived-btn"
                      onClick={() => {
                        const first = formerMembers[0];
                        if (first) selectTeamMember(first.userId);
                      }}
                    >
                      View archived members ({formerMembers.length})
                    </button>
                    <ul className="enterprise-team-roster enterprise-team-roster--former enterprise-team-roster--list">
                      {formerMembers.map((former) => {
                        const isSelected = former.userId === selectedMemberId;
                        const displayName = former.user.name ?? former.user.email ?? "Member";
                        return (
                          <li key={former.userId}>
                            <button
                              type="button"
                              className={`enterprise-team-roster-card enterprise-team-roster-card--list enterprise-team-roster-card--former${isSelected ? " enterprise-team-roster-card--selected" : ""}`}
                              onClick={() => selectTeamMember(former.userId)}
                              data-testid={`team-roster-former-${former.userId}`}
                            >
                              <UserAvatar
                                user={former.user}
                                className="enterprise-team-roster-avatar"
                                alt={displayName}
                              />
                              <span className="enterprise-team-roster-member-copy">
                                <span className="enterprise-team-roster-name">{displayName}</span>
                                <span className="enterprise-team-roster-role-line">Former member</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="enterprise-team-roster-dot-legend" aria-label="Status key">
                <span>
                  <i className="enterprise-team-roster-status-dot enterprise-team-roster-status-dot--ok" /> On Track
                </span>
                <span>
                  <i className="enterprise-team-roster-status-dot enterprise-team-roster-status-dot--warn" /> Due Soon
                </span>
                <span>
                  <i className="enterprise-team-roster-status-dot enterprise-team-roster-status-dot--bad" /> Overdue
                </span>
              </div>
            </div>
          </div>
        </aside>
        ) : null}

        <main className="enterprise-team-split-detail">
          {profileMember &&
          (selectedMember
            ? canViewMemberProfile(myRole, profileMember.userId, myId, profileMember.role)
            : manageMembers) ? (
            <TeamMemberProfilePanel
              key={profileMember.userId}
              teamId={teamDetail.id}
              teamName={teamDetail.name}
              member={profileMember}
              isSelf={profileMember.userId === myId}
              currentUserId={myId}
              isFormerMember={isFormerMemberProfile}
              managerName={ownerMember?.user.name ?? ownerMember?.user.email ?? null}
              leaderUserId={ownerMember?.userId ?? null}
              ownerEmail={ownerMember?.user.email ?? null}
              canModerateRecognitions={myRole === "owner" || myRole === "admin"}
              roleLabel={isFormerMemberProfile ? "Former member" : roleLabel(profileMember.role)}
              roleBadgeClass={isFormerMemberProfile ? "enterprise-team-role-badge enterprise-team-role-badge--former" : roleBadgeClass(profileMember.role)}
              canManage={!isFormerMemberProfile && canOpenMemberRow(myRole, profileMember)}
              canCreateOneOne={!isFormerMemberProfile && (myRole === "owner" || myRole === "team_leader")}
              canCreateDevGoal={
                !isFormerMemberProfile &&
                (profileMember.userId === myId ||
                  myRole === "owner" ||
                  myRole === "team_leader" ||
                  myRole === "admin")
              }
              canAddDevNotes={
                !isFormerMemberProfile &&
                (profileMember.userId === myId ||
                  myRole === "owner" ||
                  myRole === "team_leader" ||
                  myRole === "admin")
              }
              overdueFollowUpTasks={memberStats?.[profileMember.userId]?.overdueFollowUpTasks}
              activeTasks={memberStats?.[profileMember.userId]?.activeTasks}
              completedTasks={memberStats?.[profileMember.userId]?.completedTasks}
              activeDevGoals={memberStats?.[profileMember.userId]?.activeDevGoals}
              workplaceStandards={workplaceStandards}
              standardsCompliance={memberStats?.[profileMember.userId]?.standardsCompliance}
              daysSinceLastCheckIn={memberStats?.[profileMember.userId]?.daysSinceLastOneOnOne}
              canManageStandards={canManageOneOneTemplates}
              onManageStandards={() => setWorkplaceStandardsOpen(true)}
              onBack={isRegularMember ? undefined : () => setRosterDrawerOpen(true)}
              onManage={() => openMemberModal(profileMember)}
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
        teamName={teamDetail.name}
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
