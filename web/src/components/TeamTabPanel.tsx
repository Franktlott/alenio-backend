import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { NoTeamsEmptyState } from "./NoTeamsEmptyState";
import {
  approveTeamJoinRequest,
  fetchTeamJoinRequests,
  fetchTeamMemberStats,
  fetchTeamMonthlyCompletion,
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
  type MonthlyCompletionRow,
  type TeamMemberStatsMap,
  type WebMeUser,
  type WebTeamDetail,
  type WebTeamJoinRequest,
  type WebTeamMemberRow,
  type WebTeamRow,
} from "../lib/api";

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

function isTaskOverdue(t: ApiTask, todayStart: Date): boolean {
  if (t.status === "done") return false;
  if (!t.dueDate) return false;
  return new Date(t.dueDate) < todayStart;
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
  const [monthly, setMonthly] = useState<MonthlyCompletionRow[] | null>(null);
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

  const hasTeams = (teams?.length ?? 0) > 0;
  const myId = me?.id ?? "";

  const loadTeamContext = useCallback(async () => {
    if (!selectedTeamId) {
      setTeamDetail(null);
      setMemberStats(null);
      setMonthly(null);
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
      const [stats, months, tasks, sub, joinList] = await Promise.all([
        fetchTeamMemberStats(selectedTeamId).catch(() => null),
        fetchTeamMonthlyCompletion(selectedTeamId).catch(() => null),
        fetchWebTeamTasks(selectedTeamId).catch(() => []),
        fetchWebTeamSubscription(selectedTeamId).catch(() => null),
        manageJoin ? fetchTeamJoinRequests(selectedTeamId).catch(() => []) : Promise.resolve([]),
      ]);
      setMemberStats(stats);
      setMonthly(months);
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

  const overview = useMemo(() => {
    const totalCompleted = overviewTasks.filter((t) => t.status === "done").length;
    const totalOverdue = overviewTasks.filter((t) => isTaskOverdue(t, todayStart)).length;
    const totalInProgress = overviewTasks.filter(
      (t) => t.status === "in_progress" && !isTaskOverdue(t, todayStart),
    ).length;
    const totalOpen = overviewTasks.filter((t) => t.status === "todo" && !isTaskOverdue(t, todayStart)).length;
    const denom = totalCompleted + totalOpen + totalInProgress + totalOverdue;
    const weekCompletionPct = denom > 0 ? Math.round((totalCompleted / denom) * 100) : 0;
    const nonNullPcts = (monthly ?? []).map((m) => m.completionPct).filter((p): p is number => p !== null);
    const avgCompletionPct =
      nonNullPcts.length > 0 ? Math.round(nonNullPcts.reduce((a, b) => a + b, 0) / nonNullPcts.length) : null;
    const ringPct = denom > 0 ? Math.max(0, Math.min(100, avgCompletionPct ?? weekCompletionPct)) : 0;
    return {
      totalCompleted,
      totalOverdue,
      totalInProgress,
      totalOpen,
      weekCompletionPct,
      avgCompletionPct,
      ringPct,
    };
  }, [overviewTasks, todayStart, monthly]);

  const sortedMembers = useMemo(() => [...(teamDetail?.members ?? [])].sort(memberSort), [teamDetail?.members]);

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

  return (
    <div className="enterprise-team-tab">
      {tabErr ? (
        <p className="enterprise-form-error" role="alert" style={{ marginBottom: 12 }}>
          {tabErr}
        </p>
      ) : null}

      <section className="enterprise-card enterprise-profile-account enterprise-team-ws-profile-card">
        <div className="enterprise-profile-account-head">
          <h2 className="enterprise-card-title enterprise-card-title-spaced enterprise-profile-account-title">Workspace</h2>
          <div className="enterprise-team-ws-head-actions">
            {myRole !== "owner" ? (
              <button
                type="button"
                className="enterprise-team-leave-inline"
                disabled={leaveBusy}
                onClick={() => void onLeaveTeam()}
              >
                <IconLogOut /> {leaveBusy ? "Leaving…" : "Leave"}
              </button>
            ) : null}
            {!isEditingWorkspace ? (
              <>
                <button
                  type="button"
                  className="enterprise-profile-edit-btn enterprise-profile-edit-btn-with-icon"
                  onClick={() => void shareInvite()}
                >
                  <IconUserPlus size={14} /> Add member
                </button>
                <button type="button" className="enterprise-profile-edit-btn" onClick={() => void copyInvite()}>
                  Copy code
                </button>
                {manageMembers ? (
                  <button
                    type="button"
                    className="enterprise-profile-edit-btn enterprise-profile-edit-btn-with-icon"
                    onClick={() => {
                      setTabErr(null);
                      setIsEditingWorkspace(true);
                      setNameEdit(teamDetail.name);
                    }}
                  >
                    <IconPencil /> Edit
                  </button>
                ) : null}
              </>
            ) : (
              <div className="enterprise-profile-account-actions">
                <button
                  type="button"
                  className="enterprise-profile-cancel-btn"
                  disabled={nameSaving}
                  onClick={() => {
                    setIsEditingWorkspace(false);
                    setNameEdit(teamDetail.name);
                    setTabErr(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="auth-submit"
                  disabled={nameSaving || !nameEdit.trim()}
                  onClick={() => void onSaveTeamName()}
                >
                  {nameSaving ? "Saving…" : "Save workspace"}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="enterprise-profile-account-row">
          <div className="enterprise-profile-avatar-col">
            {manageMembers && isEditingWorkspace ? (
              <button
                type="button"
                className="enterprise-profile-avatar-btn"
                disabled={photoBusy}
                onClick={() => void onPickTeamPhoto()}
                title="Change workspace photo"
              >
                {photoBusy ? (
                  <span className="enterprise-muted">…</span>
                ) : teamDetail.image ? (
                  <img src={teamDetail.image} alt="" className="enterprise-profile-avatar-img" />
                ) : (
                  <span className="enterprise-profile-avatar-initials">{teamDetail.name?.[0]?.toUpperCase() ?? "T"}</span>
                )}
              </button>
            ) : (
              <div className="enterprise-profile-avatar-preview">
                {photoBusy ? (
                  <span className="enterprise-muted">…</span>
                ) : teamDetail.image ? (
                  <img src={teamDetail.image} alt="" className="enterprise-profile-avatar-img" />
                ) : (
                  <span className="enterprise-profile-avatar-initials">{teamDetail.name?.[0]?.toUpperCase() ?? "T"}</span>
                )}
              </div>
            )}
            {manageMembers && isEditingWorkspace ? (
              <button type="button" className="enterprise-team-pill-btn" disabled={photoBusy} onClick={() => void onPickTeamPhoto()}>
                {photoBusy ? "Updating…" : "Update photo"}
              </button>
            ) : null}
          </div>
          <div className="enterprise-profile-account-fields">
            {isEditingWorkspace && manageMembers ? (
              <>
                <label className="enterprise-muted enterprise-profile-label" htmlFor="team-ws-name">
                  Workspace name
                </label>
                <input
                  id="team-ws-name"
                  className="auth-input enterprise-profile-name-input"
                  value={nameEdit}
                  onChange={(e) => setNameEdit(e.target.value)}
                  autoComplete="organization"
                />
                <p className="enterprise-profile-edit-hint">Invite code stays the same for everyone.</p>
              </>
            ) : (
              <>
                <span className="enterprise-muted enterprise-profile-label">Workspace name</span>
                <p className="enterprise-profile-name-display">{teamDetail.name}</p>
              </>
            )}
            <span className="enterprise-team-account-pill-badge">
              {roleLabel(myRole)} · Team access enabled
            </span>
            <div className="enterprise-team-code-row-ws enterprise-team-ws-invite-tools">
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
      </section>

      {manageJoin && incoming.length > 0 ? (
        <section className="enterprise-card enterprise-team-section">
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

      <section className="enterprise-card enterprise-profile-teams">
        <div className="enterprise-team-members-head">
          <div>
            <h2 className="enterprise-card-title enterprise-card-title-spaced">Team members</h2>
            <p className="enterprise-muted enterprise-profile-teams-hint enterprise-team-members-sub">
              People in this workspace.
            </p>
          </div>
          <div className="enterprise-team-ws-head-actions enterprise-team-members-head-actions">
            <button
              type="button"
              className="enterprise-profile-edit-btn enterprise-profile-edit-btn-with-icon"
              onClick={() => void shareInvite()}
            >
              <IconUserPlus size={14} /> Add member
            </button>
            <button type="button" className="enterprise-profile-edit-btn" onClick={() => void copyInvite()}>
              Copy code
            </button>
          </div>
        </div>
        {manageMembers ? (
          <p className="enterprise-muted enterprise-team-owner-hint">
            {myRole === "owner"
              ? "Tap a member to change role, transfer ownership, or remove."
              : "Tap a member to remove them from the team."}
          </p>
        ) : null}
        <ul className="enterprise-team-member-card-list">
          {sortedMembers.map((m) => {
            const stats = memberStats?.[m.userId];
            const streak = stats?.streak ?? 0;
            const overdue = stats?.overdueTasks ?? 0;
            const isSelf = m.userId === myId;
            const rowOpen = canOpenMemberRow(myRole, m);
            return (
              <li key={m.id} className="enterprise-team-member-card-item">
                <div
                  className={`enterprise-team-member-wrap enterprise-team-member-card-inner ${isSelf ? "enterprise-team-member-self" : ""}`}
                >
                  <button
                    type="button"
                    className="enterprise-team-member-main"
                    onClick={() => rowOpen && openMemberModal(m)}
                    disabled={!rowOpen}
                  >
                    <span className="enterprise-team-member-av">
                      {m.user.image ? (
                        <img src={m.user.image} alt="" />
                      ) : (
                        (m.user.name?.[0] ?? "?").toUpperCase()
                      )}
                    </span>
                    <span className="enterprise-team-member-center">
                      <span className="enterprise-team-member-name-line">
                        <span className="enterprise-team-member-name">
                          {m.user.name ?? m.user.email ?? "Member"}
                          {isSelf ? " (you)" : ""}
                        </span>
                        <span className={roleBadgeClass(m.role)}>{roleLabel(m.role)}</span>
                      </span>
                      {m.user.email ? (
                        <span className="enterprise-muted enterprise-team-member-email-line">{m.user.email}</span>
                      ) : null}
                      {isPaid && (streak > 0 || overdue > 0) ? (
                        <span className="enterprise-team-member-submetrics">
                          {isPaid && streak > 0 ? <span title="Streak">🔥 {streak}</span> : null}
                          {overdue > 0 ? <span className="enterprise-stat-overdue">⚠ {overdue}</span> : null}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="enterprise-team-member-kebab"
                    aria-label="Member actions"
                    disabled={!rowOpen}
                    onClick={() => rowOpen && openMemberModal(m)}
                  >
                    ⋮
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {isPaid ? (
        <section className="enterprise-card enterprise-team-section">
          <h3 className="enterprise-card-title">Team overview</h3>
          <div className="enterprise-team-overview">
            <div className="enterprise-team-ring-wrap" aria-hidden>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(overview.ringPct / 100) * 326.73} 326.73`}
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div className="enterprise-team-ring-label">
                <span className="enterprise-team-ring-pct">{overview.ringPct}%</span>
                <span className="enterprise-muted" style={{ fontSize: 11 }}>
                  6-mo avg
                </span>
              </div>
            </div>
            <div className="enterprise-team-stat-cols">
              <div>
                <span className="enterprise-team-stat-n enterprise-stat-open">{overview.totalOpen}</span>
                <span className="enterprise-muted">Open</span>
              </div>
              <div>
                <span className="enterprise-team-stat-n enterprise-stat-progress">{overview.totalInProgress}</span>
                <span className="enterprise-muted">In progress</span>
              </div>
              <div>
                <span className="enterprise-team-stat-n enterprise-stat-overdue">{overview.totalOverdue}</span>
                <span className="enterprise-muted">Overdue</span>
              </div>
            </div>
          </div>
          {monthly && monthly.some((m) => m.completionPct !== null) ? (
            <div className="enterprise-team-mini-chart">
              {monthly.map((m) => {
                const pct = m.completionPct;
                const barH = pct == null ? 6 : Math.max(10, Math.round((pct / 100) * 88));
                return (
                  <div key={`${m.year}-${m.month}`} className="enterprise-team-bar-col">
                    <div
                      className="enterprise-team-bar"
                      style={{ height: barH }}
                      title={pct !== null ? `${pct}%` : "—"}
                    />
                    <span className="enterprise-team-bar-label">{m.label}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {overview.totalOverdue > 0 ? (
        <div className="enterprise-team-attention">
          <strong>Needs attention</strong>
          <span>
            {overview.totalOverdue} overdue task{overview.totalOverdue !== 1 ? "s" : ""} — review on{" "}
            <Link to="/dashboard">Execute</Link>.
          </span>
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
    </div>
  );
}
