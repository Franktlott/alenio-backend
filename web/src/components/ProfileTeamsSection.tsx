import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  cancelMyJoinRequest,
  deleteTeam,
  fetchMyJoinRequests,
  leaveTeam,
  type MyJoinRequestRow,
  type WebTeamRow,
} from "../lib/api";
import { WorkspaceCreateJoinModals } from "./WorkspaceCreateJoinModals";
type Props = {
  teams: WebTeamRow[];
  selectedTeamId: string;
  onSelectWorkspace: (teamId: string) => void;
  onRefresh: () => Promise<void>;
  onWorkspaceDeleted?: (deletedId: string) => Promise<void>;
};

function isWorkspaceOwner(role: string): boolean {
  return role === "owner";
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

function IconUserPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconCheckSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ProfileTeamsSection({ teams, selectedTeamId, onSelectWorkspace, onRefresh, onWorkspaceDeleted }: Props) {
  const [pending, setPending] = useState<MyJoinRequestRow[]>([]);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [leaveId, setLeaveId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebTeamRow | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteShowPassword, setDeleteShowPassword] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [workspaceMenuId, setWorkspaceMenuId] = useState<string | null>(null);
  const [sectionErr, setSectionErr] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinInfo, setJoinInfo] = useState<string | null>(null);
  const [copiedTeamId, setCopiedTeamId] = useState<string | null>(null);

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeletePassword("");
    setDeleteShowPassword(false);
    setDeleteErr(null);
  };

  const deleteConfirmationReady = deletePassword.trim().length > 0;

  const handleConfirmDeleteWorkspace = async () => {
    if (!deleteTarget || !deleteConfirmationReady || deleteBusy) return;
    setDeleteErr(null);
    setDeleteBusy(true);
    try {
      await deleteTeam(deleteTarget.id, { password: deletePassword });
      const deletedId = deleteTarget.id;
      closeDeleteModal();
      await onRefresh();
      await loadPending();
      if (onWorkspaceDeleted) await onWorkspaceDeleted(deletedId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not delete workspace.";
      setDeleteErr(msg === "Incorrect password" ? "Incorrect password. Please try again." : msg);
    } finally {
      setDeleteBusy(false);
    }
  };

  useEffect(() => {
    if (!workspaceMenuId) return;
    const close = () => setWorkspaceMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [workspaceMenuId]);

  const loadPending = useCallback(async () => {
    try {
      const rows = await fetchMyJoinRequests();
      setPending(rows.filter((r) => r.status === "pending"));
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    void loadPending();
    const t = window.setInterval(() => void loadPending(), 20_000);
    return () => clearInterval(t);
  }, [loadPending]);

  const copyInviteCode = async (teamId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedTeamId(teamId);
      window.setTimeout(() => setCopiedTeamId((current) => (current === teamId ? null : current)), 2000);
    } catch {
      setSectionErr("Could not copy invite code.");
    }
  };

  return (
    <section className="enterprise-card enterprise-profile-teams">
      <div className="enterprise-card-head enterprise-card-head-row enterprise-profile-workspaces-head">
        <div>
          <h2 className="enterprise-card-title enterprise-profile-workspaces-title">Workspaces</h2>
          <p className="enterprise-muted enterprise-profile-workspaces-sub">
            Manage the workspaces you belong to. Each workspace has its own plan on the Billing page.
          </p>
        </div>
        <div className="enterprise-profile-workspaces-actions">
          <button
            type="button"
            className="enterprise-profile-edit-btn enterprise-profile-edit-btn-with-icon"
            onClick={() => setCreateOpen(true)}
          >
            <IconUserPlus size={14} /> Create workspace
          </button>
          <button
            type="button"
            className="enterprise-profile-edit-btn enterprise-profile-edit-btn-with-icon"
            onClick={() => setJoinOpen(true)}
          >
            <IconPlus size={14} /> Join workspace
          </button>
        </div>
      </div>
      {joinInfo ? (
        <p className="enterprise-no-teams-info" role="status" style={{ marginBottom: 12 }}>
          {joinInfo}
        </p>
      ) : null}
      {sectionErr ? (
        <p className="enterprise-form-error" role="alert">
          {sectionErr}
        </p>
      ) : null}

      <WorkspaceCreateJoinModals
        joinOpen={joinOpen}
        createOpen={createOpen}
        onCloseJoin={() => setJoinOpen(false)}
        onCloseCreate={() => setCreateOpen(false)}
        onRefreshWorkspaces={onRefresh}
        onJoinSuccessInfo={(msg) => {
          setJoinInfo(msg);
          window.setTimeout(() => setJoinInfo(null), 8000);
        }}
      />

      <div className="enterprise-profile-teams-scroll">
      {pending.length > 0 ? (
        <div className="enterprise-profile-pending-block">
          <div className="enterprise-muted enterprise-profile-subhead">Pending join requests</div>
          <ul className="enterprise-profile-pending-list">
            {pending.map((r) => (
              <li key={r.id} className="enterprise-profile-pending-row">
                <span>
                  <strong>{r.team.name}</strong>
                  <span className="enterprise-muted"> — waiting for approval</span>
                </span>
                <button
                  type="button"
                  className="enterprise-team-btn-destructive"
                  disabled={cancelId === r.id}
                  onClick={async () => {
                    setSectionErr(null);
                    setCancelId(r.id);
                    try {
                      await cancelMyJoinRequest(r.id);
                      await loadPending();
                      await onRefresh();
                    } catch (e) {
                      setSectionErr(e instanceof Error ? e.message : "Could not cancel request.");
                    } finally {
                      setCancelId(null);
                    }
                  }}
                >
                  {cancelId === r.id ? "Canceling…" : "Withdraw"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {teams.length === 0 ? (
        <p className="enterprise-muted">You are not in any workspace yet.</p>
      ) : (
        <div className="enterprise-profile-ws-card-grid">
          {teams.map((t) => {
            const members = t._count?.members ?? 0;
            const isCurrent = t.id === selectedTeamId;
            const memberLine = `${members} member${members === 1 ? "" : "s"} · Team access enabled`;
            return (
              <article
                key={t.id}
                className={`enterprise-profile-ws-card${isCurrent ? " enterprise-profile-ws-card-current" : ""}`}
                data-testid={`profile-workspace-card-${t.id}`}
                aria-current={isCurrent ? "true" : undefined}
              >
                <div className="enterprise-profile-ws-card-body">
                  <div className="enterprise-profile-ws-card-icon" aria-hidden>
                    {t.image ? (
                      <img
                        src={t.image}
                        alt=""
                        className="enterprise-profile-ws-card-icon-img"
                      />
                    ) : (
                      <span className="enterprise-profile-ws-card-icon-initials">
                        {t.name?.[0]?.toUpperCase() ?? "W"}
                      </span>
                    )}
                  </div>
                  <div className="enterprise-profile-ws-card-main">
                    <h3 className="enterprise-profile-ws-card-name">{t.name}</h3>
                    {isCurrent ? (
                      <p className="enterprise-profile-ws-active-line">
                        <IconCheckSmall />
                        Active workspace
                      </p>
                    ) : null}
                    <p className="enterprise-muted enterprise-profile-ws-card-meta">{memberLine}</p>
                    {t.inviteCode ? (
                      <div className="enterprise-profile-ws-invite-row">
                        <span className="enterprise-profile-ws-invite-label">Invite code</span>
                        <span className="enterprise-team-code-mono enterprise-profile-ws-invite-code">{t.inviteCode}</span>
                        <button
                          type="button"
                          className="enterprise-profile-ws-copy-btn"
                          onClick={() => void copyInviteCode(t.id, t.inviteCode!)}
                        >
                          {copiedTeamId === t.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="enterprise-profile-ws-card-top-right">
                    {isCurrent ? (
                      <span className="enterprise-profile-ws-current-badge">Current</span>
                    ) : null}
                    <div className="enterprise-profile-workspace-menu-wrap">
                      <button
                        type="button"
                        className="enterprise-profile-workspace-more"
                        aria-label={`Actions for ${t.name}`}
                        aria-expanded={workspaceMenuId === t.id}
                        data-testid={`workspace-menu-${t.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setWorkspaceMenuId((prev) => (prev === t.id ? null : t.id));
                        }}
                      >
                        ⋯
                      </button>
                      {workspaceMenuId === t.id ? (
                        <div className="enterprise-profile-workspace-menu" role="menu">
                          {isWorkspaceOwner(t.role) ? (
                            <button
                              type="button"
                              role="menuitem"
                              className="enterprise-profile-workspace-menu-danger"
                              data-testid={`delete-workspace-${t.id}`}
                              onClick={() => {
                                setWorkspaceMenuId(null);
                                setDeleteErr(null);
                                setDeletePassword("");
                                setDeleteTarget(t);
                              }}
                            >
                              Delete workspace
                            </button>
                          ) : (
                            <button
                              type="button"
                              role="menuitem"
                              disabled={leaveId === t.id}
                              onClick={async () => {
                                if (!window.confirm(`Leave “${t.name}”? You will lose access until invited again.`)) return;
                                setWorkspaceMenuId(null);
                                setSectionErr(null);
                                setLeaveId(t.id);
                                try {
                                  await leaveTeam(t.id);
                                  await onRefresh();
                                  await loadPending();
                                } catch (err) {
                                  setSectionErr(err instanceof Error ? err.message : "Could not leave workspace.");
                                } finally {
                                  setLeaveId(null);
                                }
                              }}
                            >
                              {leaveId === t.id ? "Leaving…" : "Leave workspace"}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <footer className="enterprise-profile-ws-card-foot">
                  <span className={roleBadgeClass(t.role)}>{roleLabel(t.role)}</span>
                  {isCurrent ? (
                    <span className="enterprise-profile-ws-card-foot-spacer" aria-hidden="true" />
                  ) : (
                    <button
                      type="button"
                      className="enterprise-profile-ws-select-btn"
                      onClick={() => onSelectWorkspace(t.id)}
                      data-testid={`profile-workspace-switch-${t.id}`}
                    >
                      Select
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
      </div>

      {deleteTarget ? (
        <div
          className="enterprise-profile-delete-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-workspace-title"
          data-testid="delete-workspace-modal"
        >
          <button type="button" className="enterprise-profile-delete-backdrop" aria-label="Close" onClick={closeDeleteModal} />
          <div className="enterprise-profile-delete-dialog">
            <h3 id="delete-workspace-title" className="enterprise-profile-delete-title">
              Delete workspace?
            </h3>
            <p className="enterprise-muted enterprise-profile-delete-copy">
              This permanently deletes <strong>{deleteTarget.name}</strong> and all its tasks, messages, calendar events,
              and files. Members keep their personal accounts.
            </p>
            <p className="enterprise-muted enterprise-profile-delete-copy" style={{ marginBottom: "1rem" }}>
              Enter your account password to confirm.
            </p>
            <label className="enterprise-muted enterprise-profile-delete-label" htmlFor="delete-workspace-password">
              Your account password
            </label>
            <div className="enterprise-profile-delete-password-row">
              <input
                id="delete-workspace-password"
                type={deleteShowPassword ? "text" : "password"}
                className="auth-input"
                value={deletePassword}
                onChange={(e) => {
                  setDeletePassword(e.target.value);
                  setDeleteErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && deleteConfirmationReady && !deleteBusy) {
                    e.preventDefault();
                    void handleConfirmDeleteWorkspace();
                  }
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
                data-testid="delete-workspace-password-input"
              />
              <button
                type="button"
                className="enterprise-profile-delete-password-toggle"
                onClick={() => setDeleteShowPassword((v) => !v)}
              >
                {deleteShowPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="enterprise-profile-delete-forgot">
              <Link
                to="/forgot-password"
                className="auth-v2-inline-link"
                data-testid="delete-workspace-forgot-password"
                onClick={() => closeDeleteModal()}
              >
                Forgot password?
              </Link>
            </p>
            {deleteErr ? (
              <p className="enterprise-form-error" role="alert">
                {deleteErr}
              </p>
            ) : null}
            <div className="enterprise-profile-delete-actions">
              <button
                type="button"
                className="enterprise-team-btn-destructive enterprise-profile-delete-submit"
                disabled={deleteBusy || !deleteConfirmationReady}
                data-testid="confirm-delete-workspace"
                onClick={() => void handleConfirmDeleteWorkspace()}
              >
                {deleteBusy ? "Deleting…" : "Delete forever"}
              </button>
              <button type="button" className="auth-link-button" onClick={closeDeleteModal} disabled={deleteBusy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
