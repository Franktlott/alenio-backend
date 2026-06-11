import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { queryKeys } from "../lib/query-keys";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { AddMemberModal } from "./AddMemberModal";
import { TeamMemberProfilePanel } from "./TeamMemberProfilePanel";
import { OneOnOneTemplatesModal } from "./OneOnOneTemplatesModal";
import {
  approveTeamJoinRequest,
  cancelTeamInvite,
  fetchTeamInvites,
  fetchTeamJoinRequests,
  fetchTeamMemberStats,
  fetchWebTeam,
  fetchWebTeamSubscription,
  fetchWebTeamTasks,
  inviteMemberByEmail,
  leaveTeam,
  patchApiTeam,
  rejectTeamJoinRequest,
  removeTeamMemberApi,
  resendTeamInvite,
  setTeamMemberRole,
  transferTeamOwnership,
  uploadTeamPhoto,
  type ApiTask,
  type TeamMemberStatsMap,
  type WebMeUser,
  type WebTeamDetail,
  type WebTeamInvite,
  type WebTeamJoinRequest,
  type WebTeamMemberRow,
  type WebTeamRow,
} from "../lib/api";

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

function formatStreakLabel(streak: number, paid: boolean): string {
  if (!paid) return "—";
  if (streak <= 0) return "0d";
  return `${streak}d`;
}

function formatDaysSinceOneOnOne(days: number | null | undefined): string {
  if (days == null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
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

function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconLogOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconAlertTriangle({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
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

function IconStatMembers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function IconStatCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
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

async function fetchTeamContext(teamId: string) {
  const detail = await fetchWebTeam(teamId);
  const manageJoin = canManageJoinRequests(detail.myRole);
  const [stats, tasks, sub, joinList, inviteList] = await Promise.all([
    fetchTeamMemberStats(teamId).catch(() => null),
    fetchWebTeamTasks(teamId).catch(() => []),
    fetchWebTeamSubscription(teamId).catch(() => null),
    manageJoin ? fetchTeamJoinRequests(teamId).catch(() => []) : Promise.resolve([]),
    manageJoin ? fetchTeamInvites(teamId).catch(() => []) : Promise.resolve([]),
  ]);
  const plan = sub?.plan ?? "free";
  return {
    detail,
    memberStats: stats,
    overviewTasks: Array.isArray(tasks) ? tasks : [],
    isPaid: plan === "team" || plan === "pro",
    incoming: manageJoin ? joinList : [],
    pendingInvites: manageJoin ? inviteList : [],
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

function IconMail({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatInviteExpiry(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Expired";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

function inviteInitial(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (local[0] ?? "?").toUpperCase();
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
  const queryClient = useQueryClient();
  const teamContextQuery = useQuery({
    queryKey: queryKeys.teamContext(selectedTeamId),
    queryFn: () => fetchTeamContext(selectedTeamId),
    enabled: !!selectedTeamId,
  });

  const teamDetail = teamContextQuery.data?.detail ?? null;
  const memberStats = teamContextQuery.data?.memberStats ?? null;
  const overviewTasks = teamContextQuery.data?.overviewTasks ?? [];
  const isPaid = teamContextQuery.data?.isPaid ?? false;
  const incoming = teamContextQuery.data?.incoming ?? [];
  const pendingInvites = teamContextQuery.data?.pendingInvites ?? [];
  const tabErr =
    teamContextQuery.error instanceof Error
      ? teamContextQuery.error.message
      : teamContextQuery.isError
        ? "Could not load team."
        : null;
  const showInitialLoading = teamContextQuery.isPending && !teamContextQuery.data;

  const reloadTeamContext = useCallback(async () => {
    if (!selectedTeamId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.teamContext(selectedTeamId) });
  }, [queryClient, selectedTeamId]);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberBusy, setAddMemberBusy] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);

  const [nameEdit, setNameEdit] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [isEditingWorkspace, setIsEditingWorkspace] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [memberModal, setMemberModal] = useState<WebTeamMemberRow | null>(null);
  const [rolePick, setRolePick] = useState<"member" | "team_leader">("member");
  const [modalBusy, setModalBusy] = useState(false);

  const [leaveBusy, setLeaveBusy] = useState(false);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [oneOneTemplatesOpen, setOneOneTemplatesOpen] = useState(false);

  const myId = me?.id ?? "";

  useEffect(() => {
    if (teamDetail) setNameEdit(teamDetail.name);
  }, [teamDetail?.id, teamDetail?.name]);

  useEffect(() => {
    if (!onWorkspaceSwitchLoading) return;
    onWorkspaceSwitchLoading(showInitialLoading);
    return () => {
      onWorkspaceSwitchLoading(false);
    };
  }, [showInitialLoading, onWorkspaceSwitchLoading]);

  useEffect(() => {
    setIsEditingWorkspace(false);
  }, [selectedTeamId]);

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

  useEffect(() => {
    if (!qrOpen || !teamDetail?.inviteCode) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(teamDetail.inviteCode, { margin: 1, width: 200, color: { dark: "#1e293b", light: "#ffffff" } }).then(
      (url) => {
        if (!cancelled) setQrDataUrl(url);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [qrOpen, teamDetail?.inviteCode]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const overdueTaskCount = useMemo(
    () => overviewTasks.filter((t) => isTaskOverdue(t, todayStart)).length,
    [overviewTasks, todayStart],
  );

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

  const onSaveTeamName = async () => {
    if (!selectedTeamId || !nameEdit.trim()) return;
    setNameSaving(true);
    setTabErr(null);
    try {
      await patchApiTeam(selectedTeamId, { name: nameEdit.trim() });
      setIsEditingWorkspace(false);
      await reloadTeamContext();
      await onTeamsRefresh();
    } catch (e) {
      setTabErr(e instanceof Error ? e.message : "Could not update name.");
    } finally {
      setNameSaving(false);
    }
  };

  const onPickTeamPhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !selectedTeamId) return;
      setPhotoBusy(true);
      setTabErr(null);
      try {
        const up = await uploadTeamPhoto(file, selectedTeamId);
        await patchApiTeam(selectedTeamId, { image: up.url });
        await reloadTeamContext();
        await onTeamsRefresh();
      } catch (e) {
        setTabErr(e instanceof Error ? e.message : "Photo upload failed.");
      } finally {
        setPhotoBusy(false);
      }
    };
    input.click();
  };

  const copyInvite = async () => {
    if (!teamDetail?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(teamDetail.inviteCode);
    } catch {
      setTabErr("Could not copy to clipboard.");
    }
  };

  const shareInvite = async () => {
    if (!teamDetail?.inviteCode) return;
    const text = `Join my team "${teamDetail.name}" on Alenio! Use invite code: ${teamDetail.inviteCode}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* user cancelled share */
    }
  };

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
    setRolePick(m.role === "team_leader" ? "team_leader" : "member");
  };

  const onSaveRole = async () => {
    if (!selectedTeamId || !memberModal || teamDetail?.myRole !== "owner") return;
    if (memberModal.role === "owner") return;
    setModalBusy(true);
    setTabErr(null);
    try {
      await setTeamMemberRole(selectedTeamId, memberModal.userId, rolePick);
      setMemberModal(null);
      await reloadTeamContext();
      await onTeamsRefresh();
    } catch (e) {
      setTabErr(e instanceof Error ? e.message : "Could not update role.");
    } finally {
      setModalBusy(false);
    }
  };

  const onTransferOwnership = async () => {
    if (!selectedTeamId || !memberModal || teamDetail?.myRole !== "owner" || memberModal.userId === myId) return;
    if (!window.confirm(`Make ${memberModal.user.name ?? "this member"} the team owner? You will become a member.`)) return;
    setModalBusy(true);
    setTabErr(null);
    try {
      await transferTeamOwnership(selectedTeamId, memberModal.userId);
      setMemberModal(null);
      await reloadTeamContext();
      await onTeamsRefresh();
    } catch (e) {
      setTabErr(e instanceof Error ? e.message : "Transfer failed.");
    } finally {
      setModalBusy(false);
    }
  };

  const onRemoveMember = async () => {
    if (!selectedTeamId || !memberModal) return;
    if (!window.confirm(`Remove ${memberModal.user.name ?? "this member"} from the team?`)) return;
    setModalBusy(true);
    setTabErr(null);
    try {
      await removeTeamMemberApi(selectedTeamId, memberModal.userId);
      setMemberModal(null);
      await reloadTeamContext();
      await onTeamsRefresh();
    } catch (e) {
      setTabErr(e instanceof Error ? e.message : "Could not remove member.");
    } finally {
      setModalBusy(false);
    }
  };

  const onLeaveTeam = async () => {
    if (!selectedTeamId) return;
    if (!window.confirm("Leave this team? You will lose access until invited again.")) return;
    setLeaveBusy(true);
    setTabErr(null);
    try {
      await leaveTeam(selectedTeamId);
      setMemberModal(null);
      await onTeamsRefresh();
    } catch (e) {
      setTabErr(e instanceof Error ? e.message : "Could not leave team.");
    } finally {
      setLeaveBusy(false);
    }
  };

  const myRole = teamDetail?.myRole ?? "";
  const manageJoin = canManageJoinRequests(myRole);
  const manageMembers = canRemoveMembers(myRole);

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
        <p className="enterprise-muted">{tabErr ?? "Team not found."}</p>
      </div>
    );
  }

  const canManageOneOneTemplates = myRole === "owner";
  const showTemplateManageRow = canManageOneOneTemplates;

  return (
    <div className="enterprise-team-tab enterprise-team-page">
      {tabErr ? (
        <p className="enterprise-form-error enterprise-team-page-error" role="alert">
          {tabErr}
        </p>
      ) : null}

      <div className="enterprise-team-split">
        <aside className="enterprise-team-split-list">
          <header className="enterprise-team-list-header">
            <div className="enterprise-team-list-header-top">
              <h1 className="enterprise-team-list-title">Team</h1>
              <button
                type="button"
                className="enterprise-team-list-settings"
                onClick={() => setWorkspaceSettingsOpen(true)}
              >
                Workspace
              </button>
            </div>
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
              ) : null}
            </div>
          </header>

          <div className="enterprise-team-stat-row">
            <div className="enterprise-team-stat-card enterprise-team-stat-card--members">
              <span className="enterprise-team-stat-icon" aria-hidden><IconStatMembers /></span>
              <span className="enterprise-team-stat-copy">
                <strong>{sortedMembers.length}</strong>
                <span>Team members</span>
              </span>
            </div>
            <div className="enterprise-team-stat-card enterprise-team-stat-card--actions">
              <span className="enterprise-team-stat-icon" aria-hidden><IconStatActions /></span>
              <span className="enterprise-team-stat-copy">
                <strong>{openActionCount}</strong>
                <span>Open actions</span>
              </span>
            </div>
            <div className="enterprise-team-stat-card enterprise-team-stat-card--oneone enterprise-team-stat-card--soon">
              <span className="enterprise-team-stat-icon" aria-hidden><IconStatCalendar /></span>
              <span className="enterprise-team-stat-copy">
                <strong>—</strong>
                <span>Upcoming check-ins</span>
              </span>
            </div>
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
                              setTabErr(e instanceof Error ? e.message : "Decline failed.");
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
                              setTabErr(e instanceof Error ? e.message : "Approve failed.");
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

          {manageJoin && pendingInvites.length > 0 ? (
            <section className="enterprise-team-pending-panel" aria-label="Pending invites">
              <header className="enterprise-team-pending-head">
                <span className="enterprise-team-pending-head-icon" aria-hidden>
                  <IconMail />
                </span>
                <div className="enterprise-team-pending-head-copy">
                  <h3 className="enterprise-team-pending-title">Pending invites</h3>
                  <p className="enterprise-team-pending-sub">
                    {pendingInvites.length} waiting for {pendingInvites.length === 1 ? "a response" : "responses"}
                  </p>
                </div>
              </header>
              <ul className="enterprise-team-pending-list">
                {pendingInvites.map((invite) => {
                  const inviter = invite.invitedBy?.name ?? invite.invitedBy?.email ?? "A team leader";
                  const busy = inviteActionId === invite.id;
                  return (
                    <li key={invite.id} className="enterprise-team-pending-row">
                      <span className="enterprise-team-pending-avatar">{inviteInitial(invite.email)}</span>
                      <div className="enterprise-team-pending-main">
                        <div className="enterprise-team-pending-topline">
                          <strong className="enterprise-team-pending-email">{invite.email}</strong>
                          <span className="enterprise-team-pending-badge">Awaiting signup</span>
                        </div>
                        <p className="enterprise-team-pending-meta">
                          Invited by <strong>{inviter}</strong>
                          <span className="enterprise-team-pending-dot" aria-hidden>·</span>
                          Sent {formatInviteDate(invite.createdAt)}
                          <span className="enterprise-team-pending-dot" aria-hidden>·</span>
                          {formatInviteExpiry(invite.expiresAt)}
                        </p>
                      </div>
                      <div className="enterprise-team-pending-actions">
                        <button
                          type="button"
                          className="enterprise-team-pending-btn enterprise-team-pending-btn-ghost"
                          disabled={busy}
                          onClick={async () => {
                            setInviteActionId(invite.id);
                            setTabErr(null);
                            try {
                              await cancelTeamInvite(selectedTeamId, invite.id);
                              await reloadTeamContext();
                            } catch (e) {
                              setTabErr(e instanceof Error ? e.message : "Cancel failed.");
                            } finally {
                              setInviteActionId(null);
                            }
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="enterprise-team-pending-btn enterprise-team-pending-btn-primary"
                          disabled={busy}
                          onClick={async () => {
                            setInviteActionId(invite.id);
                            setTabErr(null);
                            try {
                              await resendTeamInvite(selectedTeamId, invite.id);
                            } catch (e) {
                              setTabErr(e instanceof Error ? e.message : "Resend failed.");
                            } finally {
                              setInviteActionId(null);
                            }
                          }}
                        >
                          {busy ? "Sending…" : "Resend invite"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {overdueTaskCount > 0 ? (
            <Link to="/dashboard" className="enterprise-team-attention enterprise-team-attention-banner enterprise-team-attention-compact">
              <span className="enterprise-team-attention-icon" aria-hidden>
                <IconAlertTriangle />
              </span>
              <span className="enterprise-team-attention-copy">
                <strong>Needs attention</strong>
                <span>
                  {overdueTaskCount} overdue task{overdueTaskCount !== 1 ? "s" : ""}
                </span>
              </span>
            </Link>
          ) : null}

          {showTemplateManageRow ? (
            <div className="enterprise-team-template-manage-row">
              <div className="enterprise-team-template-manage-card">
                <span className="enterprise-team-template-manage-icon enterprise-team-template-manage-icon--oneone" aria-hidden>
                  <IconTemplateOneOne />
                </span>
                <div className="enterprise-team-template-manage-copy">
                  <strong>Check-in templates</strong>
                </div>
                <button type="button" className="enterprise-team-template-manage-btn" onClick={() => setOneOneTemplatesOpen(true)}>
                  Manage
                </button>
              </div>
            </div>
          ) : null}

          <div className="enterprise-team-roster-section">
            <div className="enterprise-team-roster-head">
              <h2 className="enterprise-team-roster-title">Team members</h2>
              <label className="enterprise-team-role-filter enterprise-team-role-filter--soon">
                <select disabled aria-label="Filter by role">
                  <option>All roles</option>
                </select>
              </label>
            </div>

            <ul className="enterprise-team-roster">
              {filteredMembers.map((m) => {
                const isSelf = m.userId === myId;
                const isSelected = m.userId === selectedMemberId;
                const canView = canViewMemberProfile(myRole, m.userId, myId);
                const displayName = m.user.name ?? m.user.email ?? "Member";
                const stats = memberStats?.[m.userId];
                const statsReady = memberStats !== null;
                const activeDevGoals = stats?.activeDevGoals ?? 0;
                const daysSinceOneOnOne = stats?.daysSinceLastOneOnOne;
                const streak = stats?.streak ?? 0;
                const overdue = stats?.overdueTasks ?? 0;
                const cardClass = `enterprise-team-roster-card${isSelected ? " enterprise-team-roster-card--selected" : ""}${isSelf ? " enterprise-team-roster-card--self" : ""}${!canView ? " enterprise-team-roster-card--static" : ""}`;
                const cardBody = (
                  <>
                      <span className="enterprise-team-roster-avatar">
                        {m.user.image ? (
                          <img src={m.user.image} alt={displayName} />
                        ) : (
                          (m.user.name?.[0] ?? m.user.email?.[0] ?? "?").toUpperCase()
                        )}
                      </span>
                      <span className="enterprise-team-roster-main">
                        <span className="enterprise-team-roster-headline">
                          <span className="enterprise-team-roster-name">
                            {displayName}
                            {isSelf ? " (you)" : ""}
                            {overdue > 0 ? (
                              <span className="enterprise-team-roster-overdue" title={`${overdue} overdue task${overdue !== 1 ? "s" : ""}`}>
                                {overdue} overdue
                              </span>
                            ) : null}
                          </span>
                          <span className="enterprise-team-roster-role">{roleAbbrev(m.role)}</span>
                        </span>
                        <span className="enterprise-team-roster-kpis">
                          <span className="enterprise-team-roster-kpi">
                            <span className="enterprise-team-roster-kpi-label">Streak</span>
                            <span className="enterprise-team-roster-kpi-value">
                              {statsReady ? (
                                <>
                                  {isPaid && streak > 0 ? <span className="enterprise-team-roster-kpi-icon" aria-hidden>🔥 </span> : null}
                                  {formatStreakLabel(streak, isPaid)}
                                </>
                              ) : (
                                "…"
                              )}
                            </span>
                          </span>
                          <span className="enterprise-team-roster-kpi">
                            <span className="enterprise-team-roster-kpi-label">Goals</span>
                            <span className="enterprise-team-roster-kpi-value">
                              {statsReady ? activeDevGoals : "…"}
                            </span>
                          </span>
                          <span className="enterprise-team-roster-kpi">
                            <span className="enterprise-team-roster-kpi-label">Last check-in</span>
                            <span className="enterprise-team-roster-kpi-value">
                              {statsReady ? formatDaysSinceOneOnOne(daysSinceOneOnOne) : "…"}
                            </span>
                          </span>
                        </span>
                      </span>
                      {canView ? (
                        <span className="enterprise-team-roster-chevron" aria-hidden>
                          ›
                        </span>
                      ) : null}
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
              overdueTasks={memberStats?.[selectedMember.userId]?.overdueTasks}
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

      {workspaceSettingsOpen ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setWorkspaceSettingsOpen(false)}>
          <div className="enterprise-modal-sheet enterprise-team-ws-modal" role="dialog" aria-label="Workspace settings" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="enterprise-task-modal-close" aria-label="Close" onClick={() => setWorkspaceSettingsOpen(false)}>
              ×
            </button>
            <h3 style={{ marginTop: 0 }}>Workspace</h3>
            <p className="enterprise-muted">{teamDetail.name}</p>
            {myRole !== "owner" ? (
              <button
                type="button"
                className="enterprise-team-leave-inline"
                disabled={leaveBusy}
                onClick={() => void onLeaveTeam()}
                style={{ marginBottom: 12 }}
              >
                <IconLogOut /> {leaveBusy ? "Leaving…" : "Leave workspace"}
              </button>
            ) : null}
            {manageMembers && !isEditingWorkspace ? (
              <button
                type="button"
                className="enterprise-profile-edit-btn enterprise-profile-edit-btn-with-icon"
                onClick={() => {
                  setTabErr(null);
                  setIsEditingWorkspace(true);
                  setNameEdit(teamDetail.name);
                }}
              >
                <IconPencil /> Edit workspace
              </button>
            ) : null}
            {isEditingWorkspace && manageMembers ? (
              <div className="enterprise-team-ws-modal-edit">
                <label className="enterprise-muted enterprise-profile-label" htmlFor="team-ws-name-modal">
                  Workspace name
                </label>
                <input
                  id="team-ws-name-modal"
                  className="auth-input enterprise-profile-name-input"
                  value={nameEdit}
                  onChange={(e) => setNameEdit(e.target.value)}
                  autoComplete="organization"
                />
                <button
                  type="button"
                  className="enterprise-team-pill-btn"
                  disabled={photoBusy}
                  onClick={() => void onPickTeamPhoto()}
                  style={{ marginTop: 8 }}
                >
                  {photoBusy ? "Updating photo…" : "Update photo"}
                </button>
                <div className="enterprise-profile-account-actions" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="enterprise-profile-cancel-btn"
                    disabled={nameSaving}
                    onClick={() => {
                      setIsEditingWorkspace(false);
                      setNameEdit(teamDetail.name);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="auth-submit"
                    disabled={nameSaving || !nameEdit.trim()}
                    onClick={async () => {
                      await onSaveTeamName();
                      setIsEditingWorkspace(false);
                    }}
                  >
                    {nameSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="enterprise-team-code-row-ws enterprise-team-ws-invite-tools" style={{ marginTop: 16 }}>
              <span className="enterprise-team-code-mono">{teamDetail.inviteCode}</span>
              <button type="button" className="enterprise-team-pill-btn" onClick={() => void copyInvite()}>
                Copy
              </button>
              <button type="button" className="enterprise-team-pill-btn" onClick={() => void shareInvite()}>
                Share
              </button>
              <button type="button" className="enterprise-team-pill-btn" onClick={() => setQrOpen(true)}>
                QR code
              </button>
            </div>
            <p className="enterprise-team-hint-ws">Share this code to invite team members</p>
          </div>
        </div>
      ) : null}

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

      {qrOpen ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setQrOpen(false)}>
          <div className="enterprise-modal-sheet" role="dialog" aria-label="Invite QR code" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="enterprise-task-modal-close" aria-label="Close" onClick={() => setQrOpen(false)}>
              ×
            </button>
            <p className="enterprise-muted">Scan or share the invite code: <strong>{teamDetail.inviteCode}</strong></p>
            {qrDataUrl ? <img src={qrDataUrl} alt="QR code for invite" className="enterprise-team-qr-img" /> : <p className="enterprise-muted">Generating…</p>}
          </div>
        </div>
      ) : null}

      {memberModal ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setMemberModal(null)}>
          <div className="enterprise-modal-sheet" role="dialog" aria-label="Member" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="enterprise-task-modal-close" aria-label="Close" onClick={() => setMemberModal(null)}>
              ×
            </button>
            <h3 style={{ marginTop: 0 }}>{memberModal.user.name ?? memberModal.user.email}</h3>
            <p className="enterprise-muted">{roleLabel(memberModal.role)}</p>
            {teamDetail.myRole === "owner" && memberModal.role !== "owner" && memberModal.userId !== myId ? (
              <>
                <label className="enterprise-muted" style={{ fontSize: 13 }}>
                  Role
                </label>
                <select
                  className="auth-input"
                  value={rolePick}
                  onChange={(e) => setRolePick(e.target.value as "member" | "team_leader")}
                >
                  <option value="member">Member</option>
                  <option value="team_leader">Team Leader</option>
                </select>
                <button type="button" className="auth-submit" style={{ marginTop: 12 }} disabled={modalBusy} onClick={() => void onSaveRole()}>
                  {modalBusy ? "Saving…" : "Save role"}
                </button>
                <button
                  type="button"
                  className="enterprise-team-btn-outline"
                  style={{ marginTop: 12 }}
                  disabled={modalBusy}
                  onClick={() => void onTransferOwnership()}
                >
                  Transfer ownership
                </button>
              </>
            ) : null}
            {manageMembers && memberModal.role !== "owner" && memberModal.role !== "team_leader" ? (
              <button
                type="button"
                className="enterprise-team-btn-destructive"
                style={{ marginTop: 16 }}
                disabled={modalBusy}
                onClick={() => void onRemoveMember()}
              >
                Remove from team
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <OneOnOneTemplatesModal
        teamId={teamDetail.id}
        open={oneOneTemplatesOpen}
        onClose={() => setOneOneTemplatesOpen(false)}
      />
    </div>
  );
}
