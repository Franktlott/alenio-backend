import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { NoTeamsEmptyState } from "./NoTeamsEmptyState";
import { TeamMemberProfilePanel } from "./TeamMemberProfilePanel";
import { OneOnOneTemplatesModal } from "./OneOnOneTemplatesModal";
import {
  approveTeamJoinRequest,
  fetchTeamJoinRequests,
  fetchTeamMemberStats,
  fetchWebTeam,
  fetchWebTeamSubscription,
  fetchWebTeamTasks,
  leaveTeam,
  patchApiTeam,
  rejectTeamJoinRequest,
  removeTeamMemberApi,
  setTeamMemberRole,
  transferTeamOwnership,
  uploadTeamPhoto,
  type ApiTask,
  type TeamMemberStatsMap,
  type WebMeUser,
  type WebTeamDetail,
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

function IconTemplatePlan() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
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

function memberSort(a: WebTeamMemberRow, b: WebTeamMemberRow): number {
  return (a.user.name ?? "").localeCompare(b.user.name ?? "");
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
  const [teamDetail, setTeamDetail] = useState<WebTeamDetail | null>(null);
  const [memberStats, setMemberStats] = useState<TeamMemberStatsMap | null>(null);
  const [overviewTasks, setOverviewTasks] = useState<ApiTask[]>([]);
  const [isPaid, setIsPaid] = useState(false);
  const [incoming, setIncoming] = useState<WebTeamJoinRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabErr, setTabErr] = useState<string | null>(null);

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

  const hasTeams = (teams?.length ?? 0) > 0;
  const myId = me?.id ?? "";

  const loadTeamContext = useCallback(async () => {
    if (!selectedTeamId) {
      setTeamDetail(null);
      setMemberStats(null);
      setOverviewTasks([]);
      setIncoming([]);
      return;
    }
    setLoading(true);
    setTabErr(null);
    try {
      const detail = await fetchWebTeam(selectedTeamId);
      setTeamDetail(detail);
      setNameEdit(detail.name);
      const manageJoin = canManageJoinRequests(detail.myRole);
      const [stats, tasks, sub, joinList] = await Promise.all([
        fetchTeamMemberStats(selectedTeamId).catch(() => null),
        fetchWebTeamTasks(selectedTeamId).catch(() => []),
        fetchWebTeamSubscription(selectedTeamId).catch(() => null),
        manageJoin ? fetchTeamJoinRequests(selectedTeamId).catch(() => []) : Promise.resolve([]),
      ]);
      setMemberStats(stats);
      setOverviewTasks(Array.isArray(tasks) ? tasks : []);
      const plan = sub?.plan ?? "free";
      setIsPaid(plan === "team" || plan === "pro");
      setIncoming(manageJoin ? joinList : []);
    } catch (e) {
      setTabErr(e instanceof Error ? e.message : "Could not load team.");
      setTeamDetail(null);
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    void loadTeamContext();
  }, [loadTeamContext]);

  useEffect(() => {
    if (!onWorkspaceSwitchLoading) return;
    const busy = Boolean(
      selectedTeamId && loading && (!teamDetail || teamDetail.id !== selectedTeamId),
    );
    onWorkspaceSwitchLoading(busy);
    return () => {
      onWorkspaceSwitchLoading(false);
    };
  }, [selectedTeamId, loading, teamDetail, onWorkspaceSwitchLoading]);

  useEffect(() => {
    setIsEditingWorkspace(false);
  }, [selectedTeamId]);

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
      await loadTeamContext();
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
        await loadTeamContext();
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
      await loadTeamContext();
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
      await loadTeamContext();
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
      await loadTeamContext();
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

  if (!hasTeams) {
    return (
      <div className="enterprise-team-tab">
        <NoTeamsEmptyState onRefreshWorkspaces={onTeamsRefresh} />
      </div>
    );
  }

  if (!selectedTeamId) {
    return (
      <div className="enterprise-team-tab">
        <p className="enterprise-muted">Select a workspace from the sidebar.</p>
      </div>
    );
  }

  if (loading && (!teamDetail || teamDetail.id !== selectedTeamId)) {
    return <div className="enterprise-team-tab enterprise-team-tab-loading-host" aria-busy="true" />;
  }

  if (!teamDetail) {
    return (
      <div className="enterprise-team-tab">
        <p className="enterprise-muted">{tabErr ?? "Team not found."}</p>
      </div>
    );
  }

  const developmentPlanTemplatesWired = false;
  const canManageOneOneTemplates = myRole === "owner";
  const showTemplateManageRow = manageMembers || canManageOneOneTemplates;

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
              <button
                type="button"
                className="enterprise-team-list-add-btn"
                onClick={() => void shareInvite()}
              >
                + Add member
              </button>
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
                <span>Upcoming 1:1s</span>
              </span>
            </div>
          </div>

          {manageJoin && incoming.length > 0 ? (
            <section className="enterprise-card enterprise-team-section enterprise-team-pending-compact">
              <h3 className="enterprise-card-title">Pending requests ({incoming.length})</h3>
              <ul className="enterprise-team-incoming-list">
                {incoming.map((req) => (
                  <li key={req.id} className="enterprise-team-incoming-item">
                    <div>
                      <strong>{req.user.name ?? req.user.email ?? "Someone"}</strong>
                      <span className="enterprise-muted"> wants to join</span>
                    </div>
                    <div className="enterprise-team-incoming-actions">
                      <button
                        type="button"
                        className="enterprise-join-requests-btn enterprise-join-requests-btn-decline"
                        onClick={async () => {
                          try {
                            await rejectTeamJoinRequest(selectedTeamId, req.id);
                            await loadTeamContext();
                          } catch (e) {
                            setTabErr(e instanceof Error ? e.message : "Decline failed.");
                          }
                        }}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="enterprise-join-requests-btn enterprise-join-requests-btn-approve"
                        onClick={async () => {
                          try {
                            await approveTeamJoinRequest(selectedTeamId, req.id);
                            await loadTeamContext();
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
                ))}
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
            <div
              className={`enterprise-team-template-manage-row${
                manageMembers && canManageOneOneTemplates ? "" : " enterprise-team-template-manage-row--single"
              }`}
            >
              {manageMembers ? (
              <div
                className={`enterprise-team-template-manage-card${developmentPlanTemplatesWired ? "" : " enterprise-team-template-manage-card--soon"}`}
              >
                <span className="enterprise-team-template-manage-icon enterprise-team-template-manage-icon--plan" aria-hidden>
                  <IconTemplatePlan />
                </span>
                <div className="enterprise-team-template-manage-copy">
                  <strong>Development plan templates</strong>
                  {!developmentPlanTemplatesWired ? (
                    <span className="enterprise-team-coming-soon-badge">Coming soon</span>
                  ) : null}
                </div>
                <button type="button" className="enterprise-team-template-manage-btn" disabled={!developmentPlanTemplatesWired}>
                  Manage
                </button>
              </div>
              ) : null}
              {canManageOneOneTemplates ? (
              <div className="enterprise-team-template-manage-card">
                <span className="enterprise-team-template-manage-icon enterprise-team-template-manage-icon--oneone" aria-hidden>
                  <IconTemplateOneOne />
                </span>
                <div className="enterprise-team-template-manage-copy">
                  <strong>1:1 templates</strong>
                </div>
                <button type="button" className="enterprise-team-template-manage-btn" onClick={() => setOneOneTemplatesOpen(true)}>
                  Manage
                </button>
              </div>
              ) : null}
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
                const displayName = m.user.name ?? m.user.email ?? "Member";
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      className={`enterprise-team-roster-card${isSelected ? " enterprise-team-roster-card--selected" : ""}${isSelf ? " enterprise-team-roster-card--self" : ""}`}
                      onClick={() => setSelectedMemberId(m.userId)}
                      data-testid={`team-roster-member-${m.userId}`}
                    >
                      <span className="enterprise-team-roster-avatar">
                        {m.user.image ? (
                          <img src={m.user.image} alt={displayName} />
                        ) : (
                          (m.user.name?.[0] ?? m.user.email?.[0] ?? "?").toUpperCase()
                        )}
                      </span>
                      <span className="enterprise-team-roster-main">
                        <span className="enterprise-team-roster-name">
                          {displayName}
                          {isSelf ? " (you)" : ""}
                        </span>
                        <span className="enterprise-team-roster-role">{roleAbbrev(m.role)}</span>
                        <span className="enterprise-team-roster-progress-block enterprise-team-roster-metric--soon">
                          <span className="enterprise-team-roster-metric-label">Development progress</span>
                          <span className="enterprise-team-roster-progress-row">
                            <span className="enterprise-team-roster-progress" aria-hidden>
                              <span className="enterprise-team-roster-progress-fill" style={{ width: "0%" }} />
                            </span>
                            <span className="enterprise-team-roster-progress-pct">—</span>
                          </span>
                        </span>
                      </span>
                      <span className="enterprise-team-roster-oneone enterprise-team-roster-metric--soon">
                        <span className="enterprise-team-roster-metric-label">Next 1:1</span>
                        <span className="enterprise-team-roster-oneone-row">
                          <span className="enterprise-team-roster-metric-value">—</span>
                          <span className="enterprise-team-roster-chevron" aria-hidden>›</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        <main className="enterprise-team-split-detail">
          {selectedMember ? (
            <TeamMemberProfilePanel
              key={selectedMember.userId}
              teamId={selectedTeamId}
              member={selectedMember}
              isSelf={selectedMember.userId === myId}
              managerName={ownerMember?.user.name ?? ownerMember?.user.email ?? null}
              roleLabel={roleLabel(selectedMember.role)}
              roleBadgeClass={roleBadgeClass(selectedMember.role)}
              canManage={canOpenMemberRow(myRole, selectedMember)}
              canCreateOneOne={
                selectedMember.userId === myId || myRole === "owner" || myRole === "team_leader"
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
        teamId={selectedTeamId}
        open={oneOneTemplatesOpen}
        onClose={() => setOneOneTemplatesOpen(false)}
      />
    </div>
  );
}
