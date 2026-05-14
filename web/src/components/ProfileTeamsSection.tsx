import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  cancelMyJoinRequest,
  fetchMyJoinRequests,
  leaveTeam,
  type MyJoinRequestRow,
  type WebTeamRow,
} from "../lib/api";
import { WorkspaceCreateJoinModals } from "./WorkspaceCreateJoinModals";

type Props = {
  teams: WebTeamRow[];
  onRefresh: () => Promise<void>;
};

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  if (role === "admin") return "Admin";
  return "Member";
}

function IconUsersTile() {
  return (
    <span className="enterprise-profile-workspace-tile" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </span>
  );
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

function IconLogOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function ProfileTeamsSection({ teams, onRefresh }: Props) {
  const [pending, setPending] = useState<MyJoinRequestRow[]>([]);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [leaveId, setLeaveId] = useState<string | null>(null);
  const [sectionErr, setSectionErr] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinInfo, setJoinInfo] = useState<string | null>(null);

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

  return (
    <section className="enterprise-card enterprise-profile-teams">
      <div className="enterprise-profile-workspaces-head">
        <div>
          <h2 className="enterprise-card-title enterprise-card-title-spaced enterprise-profile-workspaces-title">Workspaces</h2>
          <p className="enterprise-muted enterprise-profile-workspaces-sub">Manage the teams you belong to.</p>
        </div>
        <div className="enterprise-profile-workspaces-actions">
          <button
            type="button"
            className="enterprise-profile-edit-btn enterprise-profile-edit-btn-with-icon"
            onClick={() => setCreateOpen(true)}
          >
            <IconUserPlus size={14} /> Create workspace
          </button>
          <button type="button" className="enterprise-profile-join-workspace-btn enterprise-profile-edit-btn-with-icon" onClick={() => setJoinOpen(true)}>
            <IconPlus size={14} /> Join workspace
          </button>
        </div>
      </div>
      <p className="enterprise-muted enterprise-profile-teams-team-link">
        Manage members and invites on the <Link to="/team">Team</Link> page.
      </p>
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
        <ul className="enterprise-profile-workspace-card-list">
          {teams.map((t) => {
            const members = t._count?.members ?? 0;
            const subline = `${members} member${members === 1 ? "" : "s"} · Team access enabled`;
            return (
              <li key={t.id} className="enterprise-profile-workspace-card">
                <IconUsersTile />
                <div className="enterprise-profile-workspace-card-main">
                  <div className="enterprise-profile-workspace-card-name">{t.name}</div>
                  <div className="enterprise-muted enterprise-profile-workspace-card-meta">{subline}</div>
                </div>
                <div className="enterprise-profile-workspace-card-actions">
                  <span className="enterprise-team-account-pill-badge">{roleLabel(t.role)}</span>
                  {t.role === "owner" ? null : (
                    <button
                      type="button"
                      className="enterprise-team-leave-inline"
                      disabled={leaveId === t.id}
                      onClick={async () => {
                        if (!window.confirm(`Leave “${t.name}”? You will lose access until invited again.`)) return;
                        setSectionErr(null);
                        setLeaveId(t.id);
                        try {
                          await leaveTeam(t.id);
                          await onRefresh();
                          await loadPending();
                        } catch (e) {
                          setSectionErr(e instanceof Error ? e.message : "Could not leave workspace.");
                        } finally {
                          setLeaveId(null);
                        }
                      }}
                    >
                      <IconLogOut /> {leaveId === t.id ? "Leaving…" : "Leave"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
