import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import {
  approveTeamJoinRequest,
  cancelMyJoinRequest,
  createWebTeam,
  fetchMyJoinRequests,
  fetchTeamJoinRequests,
  fetchTeamMemberStats,
  fetchTeamMonthlyCompletion,
  fetchWebTeam,
  fetchWebTeamSubscription,
  fetchWebTeamTasks,
  leaveTeam,
  patchApiTeam,
  postJoinTeamByCode,
  rejectTeamJoinRequest,
  removeTeamMemberApi,
  setTeamMemberRole,
  transferTeamOwnership,
  uploadTeamPhoto,
  type ApiTask,
  type MonthlyCompletionRow,
  type MyJoinRequestRow,
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
};

export function TeamTabPanel({ teams, selectedTeamId, me, onTeamsRefresh }: Props) {
  const [teamDetail, setTeamDetail] = useState<WebTeamDetail | null>(null);
  const [memberStats, setMemberStats] = useState<TeamMemberStatsMap | null>(null);
  const [monthly, setMonthly] = useState<MonthlyCompletionRow[] | null>(null);
  const [overviewTasks, setOverviewTasks] = useState<ApiTask[]>([]);
  const [isPaid, setIsPaid] = useState(false);
  const [incoming, setIncoming] = useState<WebTeamJoinRequest[]>([]);
  const [myPending, setMyPending] = useState<MyJoinRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabErr, setTabErr] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const [nameEdit, setNameEdit] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [memberModal, setMemberModal] = useState<WebTeamMemberRow | null>(null);
  const [rolePick, setRolePick] = useState<"member" | "team_leader">("member");
  const [modalBusy, setModalBusy] = useState(false);

  const [leaveBusy, setLeaveBusy] = useState(false);

  const hasTeams = (teams?.length ?? 0) > 0;
  const myId = me?.id ?? "";

  const loadMyPending = useCallback(async () => {
    try {
      const rows = await fetchMyJoinRequests();
      setMyPending(rows.filter((r) => r.status === "pending"));
    } catch {
      setMyPending([]);
    }
  }, []);

  useEffect(() => {
    if (hasTeams) return;
    void loadMyPending();
    const t = window.setInterval(() => void loadMyPending(), 20_000);
    return () => clearInterval(t);
  }, [hasTeams, loadMyPending]);

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
    const pending = myPending[0];
    return (
      <div className="enterprise-team-tab">
        <section className="enterprise-card" data-testid="dashboard-no-teams">
          <h2 className="enterprise-card-title enterprise-card-title-spaced">Team</h2>
          {pending ? (
            <div className="enterprise-team-pending-box">
              <p className="enterprise-muted" style={{ marginTop: 0 }}>
                Your request to join <strong>{pending.team.name}</strong> is pending approval from a team leader.
              </p>
              <button
                type="button"
                className="enterprise-team-btn-destructive"
                disabled={cancelBusy}
                onClick={async () => {
                  setCancelBusy(true);
                  try {
                    await cancelMyJoinRequest(pending.id);
                    await loadMyPending();
                  } catch (e) {
                    setTabErr(e instanceof Error ? e.message : "Could not cancel.");
                  } finally {
                    setCancelBusy(false);
                  }
                }}
              >
                {cancelBusy ? "Canceling…" : "Cancel request"}
              </button>
            </div>
          ) : (
            <>
              <p className="enterprise-muted">Join a team with an invite code, or create a new team.</p>
              <div className="enterprise-team-join-row">
                <input
                  className="auth-input enterprise-team-input"
                  placeholder="Invite code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                />
                <button
                  type="button"
                  className="auth-submit"
                  disabled={joinBusy || !joinCode.trim()}
                  onClick={async () => {
                    setJoinBusy(true);
                    setTabErr(null);
                    try {
                      await postJoinTeamByCode(joinCode.trim());
                      setJoinCode("");
                      await loadMyPending();
                    } catch (e) {
                      setTabErr(e instanceof Error ? e.message : "Could not join.");
                    } finally {
                      setJoinBusy(false);
                    }
                  }}
                >
                  {joinBusy ? "Sending…" : "Request to join"}
                </button>
              </div>
              <div className="enterprise-team-create-block">
                <label className="enterprise-muted" style={{ fontSize: 13 }}>
                  Create a team
                </label>
                <div className="enterprise-team-join-row">
                  <input
                    className="auth-input enterprise-team-input"
                    placeholder="Team name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="auth-submit"
                    disabled={createBusy || !createName.trim()}
                    onClick={async () => {
                      setCreateBusy(true);
                      setTabErr(null);
                      try {
                        await createWebTeam(createName.trim());
                        setCreateName("");
                        await onTeamsRefresh();
                      } catch (e) {
                        setTabErr(e instanceof Error ? e.message : "Could not create team.");
                      } finally {
                        setCreateBusy(false);
                      }
                    }}
                  >
                    {createBusy ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            </>
          )}
          {tabErr ? (
            <p className="enterprise-form-error" role="alert">
              {tabErr}
            </p>
          ) : null}
        </section>
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

  if (loading && !teamDetail) {
    return (
      <div className="enterprise-team-tab">
        <p className="enterprise-muted">Loading team…</p>
      </div>
    );
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

      <div className="enterprise-team-hero">
        <div className="enterprise-team-hero-inner">
          <button
            type="button"
            className="enterprise-team-avatar-btn"
            disabled={!manageMembers || photoBusy}
            onClick={() => manageMembers && onPickTeamPhoto()}
            title={manageMembers ? "Change team photo" : undefined}
          >
            {photoBusy ? (
              <span className="enterprise-muted">…</span>
            ) : teamDetail.image ? (
              <img src={teamDetail.image} alt="" className="enterprise-team-avatar-img" />
            ) : (
              <span className="enterprise-team-avatar-letter">{teamDetail.name?.[0]?.toUpperCase() ?? "T"}</span>
            )}
          </button>
          <div className="enterprise-team-hero-text">
            {manageMembers ? (
              <div className="enterprise-team-name-edit">
                <input
                  className="auth-input enterprise-team-name-input"
                  value={nameEdit}
                  onChange={(e) => setNameEdit(e.target.value)}
                />
                <button type="button" className="enterprise-inline-link" disabled={nameSaving} onClick={() => void onSaveTeamName()}>
                  {nameSaving ? "Saving…" : "Save name"}
                </button>
              </div>
            ) : (
              <h3 className="enterprise-team-title">{teamDetail.name}</h3>
            )}
            <div className="enterprise-team-code-row">
              <span className="enterprise-team-code">{teamDetail.inviteCode}</span>
              <button type="button" className="enterprise-inline-link" onClick={() => void copyInvite()}>
                Copy
              </button>
              <button type="button" className="enterprise-inline-link" onClick={() => void shareInvite()}>
                Share
              </button>
              <button type="button" className="enterprise-inline-link" onClick={() => setQrOpen(true)}>
                QR code
              </button>
            </div>
            <p className="enterprise-team-hint">Share this code to invite team members</p>
          </div>
        </div>
      </div>

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

      <section className="enterprise-card enterprise-team-section">
        <div className="enterprise-team-section-head">
          <h3 className="enterprise-card-title" style={{ marginBottom: 0 }}>
            Team members
          </h3>
          <Link to={`/chat?teamId=${encodeURIComponent(selectedTeamId)}`} className="enterprise-inline-link">
            Open team chat
          </Link>
        </div>
        {manageMembers ? (
          <p className="enterprise-muted enterprise-team-owner-hint">
            {myRole === "owner"
              ? "Tap a member to change role, transfer ownership, or remove."
              : "Tap a member to remove them from the team."}
          </p>
        ) : null}
        <ul className="enterprise-team-member-list">
          {sortedMembers.map((m) => {
            const stats = memberStats?.[m.userId];
            const streak = stats?.streak ?? 0;
            const overdue = stats?.overdueTasks ?? 0;
            const isSelf = m.userId === myId;
            const rowOpen = canOpenMemberRow(myRole, m);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={`enterprise-team-member-row ${isSelf ? "enterprise-team-member-self" : ""}`}
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
                  <span className="enterprise-team-member-info">
                    <span className="enterprise-team-member-name">
                      {m.user.name ?? m.user.email ?? "Member"}
                      {isSelf ? " (you)" : ""}
                    </span>
                    <span className="enterprise-muted">{roleLabel(m.role)}</span>
                  </span>
                  <span className="enterprise-team-member-metrics">
                    {isPaid ? <span title="Streak">🔥 {streak}</span> : null}
                    {overdue > 0 ? <span className="enterprise-stat-overdue">⚠ {overdue}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {myRole !== "owner" ? (
        <section className="enterprise-card enterprise-team-section">
          <button
            type="button"
            className="enterprise-team-btn-outline"
            disabled={leaveBusy}
            onClick={() => void onLeaveTeam()}
          >
            {leaveBusy ? "Leaving…" : "Leave team"}
          </button>
        </section>
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
