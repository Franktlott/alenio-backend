import { useCallback, useEffect, useRef, useState } from "react";
import {
  approveTeamGoLoginRequest,
  approveTeamJoinRequest,
  fetchTeamGoLoginRequests,
  fetchTeamJoinRequests,
  fetchWebTeams,
  rejectTeamGoLoginRequest,
  rejectTeamJoinRequest,
  type WebGoLoginRequest,
  type WebTeamJoinRequest,
} from "../lib/api";

type JoinRow = WebTeamJoinRequest & { teamName: string };
type GoRow = WebGoLoginRequest & { teamName: string };

function canManageApprovals(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

function requesterLabel(user: WebTeamJoinRequest["user"]): string {
  return user.name?.trim() || user.email?.trim() || "Someone";
}

type Props = {
  /** Added to the red badge count (e.g. other notification types later). */
  extraNotificationCount?: number;
};

export function JoinRequestBell({ extraNotificationCount = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const [joinRows, setJoinRows] = useState<JoinRow[]>([]);
  const [goRows, setGoRows] = useState<GoRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const teams = await fetchWebTeams();
      const managed = (teams ?? []).filter((t) => canManageApprovals(t.role));
      const joinChunks = await Promise.all(
        managed.map(async (t) => {
          try {
            const list = await fetchTeamJoinRequests(t.id);
            return list.map((r) => ({ ...r, teamName: t.name }));
          } catch {
            return [];
          }
        }),
      );
      const goChunks = await Promise.all(
        managed.map(async (t) => {
          try {
            const list = await fetchTeamGoLoginRequests(t.id);
            return list.map((r) => ({ ...r, teamName: t.name }));
          } catch {
            return [];
          }
        }),
      );
      setJoinRows(joinChunks.flat());
      setGoRows(goChunks.flat());
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load notifications.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 45_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = joinRows.length + goRows.length + extraNotificationCount;

  const onApproveJoin = async (teamId: string, requestId: string) => {
    const key = `join:${teamId}:${requestId}`;
    setBusyKey(key);
    try {
      await approveTeamJoinRequest(teamId, requestId);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not approve.");
    } finally {
      setBusyKey(null);
    }
  };

  const onRejectJoin = async (teamId: string, requestId: string) => {
    const key = `join:${teamId}:${requestId}`;
    setBusyKey(key);
    try {
      await rejectTeamJoinRequest(teamId, requestId);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not decline.");
    } finally {
      setBusyKey(null);
    }
  };

  const onApproveGo = async (teamId: string, requestId: string) => {
    const key = `go:${teamId}:${requestId}`;
    setBusyKey(key);
    try {
      await approveTeamGoLoginRequest(teamId, requestId);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not approve.");
    } finally {
      setBusyKey(null);
    }
  };

  const onRejectGo = async (teamId: string, requestId: string) => {
    const key = `go:${teamId}:${requestId}`;
    setBusyKey(key);
    try {
      await rejectTeamGoLoginRequest(teamId, requestId);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not decline.");
    } finally {
      setBusyKey(null);
    }
  };

  const empty = joinRows.length === 0 && goRows.length === 0;

  return (
    <div className="enterprise-join-requests-wrap" ref={wrapRef}>
      <button
        type="button"
        className="enterprise-topbar-bell"
        aria-label={total > 0 ? `Notifications, ${total} pending` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="topbar-notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {total > 0 ? <span className="enterprise-topbar-badge">{total > 9 ? "9+" : total}</span> : null}
      </button>
      {open ? (
        <div className="enterprise-join-requests-panel" role="dialog" aria-label="Pending approvals">
          <div className="enterprise-join-requests-panel-head">
            <span className="enterprise-join-requests-panel-title">Approvals</span>
            <span className="enterprise-join-requests-panel-sub">Teams you manage</span>
          </div>
          {loadErr ? (
            <p className="enterprise-join-requests-error" role="alert">
              {loadErr}
            </p>
          ) : null}
          {empty && !loadErr ? (
            <p className="enterprise-join-requests-empty">No pending approvals.</p>
          ) : (
            <ul className="enterprise-join-requests-list">
              {goRows.map((r) => {
                const key = `go:${r.teamId}:${r.id}`;
                const busy = busyKey === key;
                const label = r.deviceLabel?.trim() || "A device";
                return (
                  <li key={r.id} className="enterprise-join-requests-item">
                    <div className="enterprise-join-requests-item-text">
                      <strong>{label}</strong>
                      <span className="enterprise-muted enterprise-join-requests-meta">
                        wants Alenio Go access to <strong>{r.teamName}</strong>
                      </span>
                    </div>
                    <div className="enterprise-join-requests-actions">
                      <button
                        type="button"
                        className="enterprise-join-requests-btn enterprise-join-requests-btn-decline"
                        disabled={busy}
                        onClick={() => void onRejectGo(r.teamId, r.id)}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="enterprise-join-requests-btn enterprise-join-requests-btn-approve"
                        disabled={busy}
                        onClick={() => void onApproveGo(r.teamId, r.id)}
                      >
                        {busy ? "…" : "Approve"}
                      </button>
                    </div>
                  </li>
                );
              })}
              {joinRows.map((r) => {
                const key = `join:${r.teamId}:${r.id}`;
                const busy = busyKey === key;
                return (
                  <li key={r.id} className="enterprise-join-requests-item">
                    <div className="enterprise-join-requests-item-text">
                      <strong>{requesterLabel(r.user)}</strong>
                      <span className="enterprise-muted enterprise-join-requests-meta">
                        wants to join <strong>{r.teamName}</strong>
                      </span>
                    </div>
                    <div className="enterprise-join-requests-actions">
                      <button
                        type="button"
                        className="enterprise-join-requests-btn enterprise-join-requests-btn-decline"
                        disabled={busy}
                        onClick={() => void onRejectJoin(r.teamId, r.id)}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="enterprise-join-requests-btn enterprise-join-requests-btn-approve"
                        disabled={busy}
                        onClick={() => void onApproveJoin(r.teamId, r.id)}
                      >
                        {busy ? "…" : "Approve"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
