import {
  cancelTeamInvite,
  resendTeamInvite,
  type WebTeamInvite,
} from "../lib/api";

type Props = {
  open: boolean;
  teamId: string;
  invites: WebTeamInvite[];
  inviteActionId: string | null;
  onClose: () => void;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
  onInviteActionStart: (inviteId: string) => void;
  onInviteActionEnd: () => void;
};

function inviteInitial(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (local[0] ?? "?").toUpperCase();
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

export function PendingInvitesModal({
  open,
  teamId,
  invites,
  inviteActionId,
  onClose,
  onReload,
  onError,
  onInviteActionStart,
  onInviteActionEnd,
}: Props) {
  if (!open) return null;

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-modal-sheet enterprise-pending-invites-modal"
        role="dialog"
        aria-label="Pending invites"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h3 style={{ marginTop: 0 }}>Pending invites</h3>
        <p className="enterprise-muted" style={{ marginTop: 0 }}>
          {invites.length} waiting for {invites.length === 1 ? "a response" : "responses"}
        </p>
        {invites.length === 0 ? (
          <p className="enterprise-muted">No pending invites.</p>
        ) : (
          <ul className="enterprise-team-pending-list enterprise-pending-invites-modal-list">
            {invites.map((invite) => {
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
                        onInviteActionStart(invite.id);
                        try {
                          await cancelTeamInvite(teamId, invite.id);
                          await onReload();
                        } catch (e) {
                          onError(e instanceof Error ? e.message : "Cancel failed.");
                        } finally {
                          onInviteActionEnd();
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
                        onInviteActionStart(invite.id);
                        try {
                          await resendTeamInvite(teamId, invite.id);
                        } catch (e) {
                          onError(e instanceof Error ? e.message : "Resend failed.");
                        } finally {
                          onInviteActionEnd();
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
        )}
      </div>
    </div>
  );
}
