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
import { EditWorkspaceModal } from "./EditWorkspaceModal";
import { WorkspaceProfileCard } from "./WorkspaceProfileCard";
type Props = {
  teams: WebTeamRow[];
  selectedTeamId: string;
  onSelectWorkspace: (teamId: string) => void;
  onRefresh: () => Promise<void>;
  onWorkspaceDeleted?: (deletedId: string) => Promise<void>;
};

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

export function ProfileTeamsSection({ teams, selectedTeamId, onSelectWorkspace, onRefresh, onWorkspaceDeleted }: Props) {
  const [pending, setPending] = useState<MyJoinRequestRow[]>([]);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [leaveId, setLeaveId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebTeamRow | null>(null);
  const [editTarget, setEditTarget] = useState<WebTeamRow | null>(null);
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

      <div className="enterprise-profile-teams-body">
      {teams.length === 0 ? (
        <p className="enterprise-muted">You are not in any workspace yet.</p>
      ) : (
        (() => {
          const currentTeam = teams.find((t) => t.id === selectedTeamId) ?? teams[0]!;
          const otherTeams = teams.filter((t) => t.id !== currentTeam.id);
          const cardProps = {
            copiedTeamId,
            workspaceMenuId,
            leaveId,
            onCopyInvite: (teamId: string, code: string) => void copyInviteCode(teamId, code),
            onToggleMenu: (teamId: string) => setWorkspaceMenuId((prev) => (prev === teamId ? null : teamId)),
            onCloseMenu: () => setWorkspaceMenuId(null),
            onDelete: (team: WebTeamRow) => {
              setDeleteErr(null);
              setDeletePassword("");
              setDeleteTarget(team);
            },
            onEdit: (team: WebTeamRow) => {
              setSectionErr(null);
              setEditTarget(team);
            },
            onLeave: async (team: WebTeamRow) => {
              setSectionErr(null);
              setLeaveId(team.id);
              try {
                await leaveTeam(team.id);
                await onRefresh();
                await loadPending();
              } catch (err) {
                setSectionErr(err instanceof Error ? err.message : "Could not leave workspace.");
              } finally {
                setLeaveId(null);
              }
            },
          };

          return (
            <div className="enterprise-profile-ws-panel">
              <div className="enterprise-profile-ws-panel-section">
                <h3 className="enterprise-profile-ws-section-title">Current workspace</h3>
                <WorkspaceProfileCard team={currentTeam} isCurrent variant="compact" {...cardProps} />
              </div>

              {pending.length > 0 ? (
                <div className="enterprise-profile-pending-block enterprise-profile-ws-panel-pending">
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

              {otherTeams.length > 0 ? (
                <>
                  <div className="enterprise-profile-ws-panel-divider" role="separator" />
                  <div className="enterprise-profile-ws-panel-section enterprise-profile-ws-other-section">
                    <h3 className="enterprise-profile-ws-section-title">Other workspaces</h3>
                    <div className="enterprise-profile-ws-others-scroll">
                      <div className="enterprise-profile-ws-list">
                        {otherTeams.map((t) => (
                          <WorkspaceProfileCard
                            key={t.id}
                            team={t}
                            isCurrent={false}
                            variant="list"
                            onSelect={() => onSelectWorkspace(t.id)}
                            {...cardProps}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          );
        })()
      )}
      </div>

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

      <EditWorkspaceModal
        team={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={onRefresh}
      />

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
