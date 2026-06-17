import { approveWebTeamEvent, rejectWebTeamEvent, type ApiCalendarEvent } from "../lib/api";

type Props = {
  open: boolean;
  teamId: string;
  events: ApiCalendarEvent[];
  actionId: string | null;
  onClose: () => void;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
  onActionStart: (eventId: string) => void;
  onActionEnd: () => void;
};

function submitterInitial(name: string): string {
  return (name[0] ?? "?").toUpperCase();
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function PendingCalendarEventsModal({
  open,
  teamId,
  events,
  actionId,
  onClose,
  onReload,
  onError,
  onActionStart,
  onActionEnd,
}: Props) {
  if (!open) return null;

  return (
    <div className="enterprise-task-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-pending-invites-modal"
        role="dialog"
        aria-label="Calendar requests"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <header className="enterprise-pending-invites-modal-head">
          <h3 className="enterprise-pending-invites-modal-title">Calendar requests</h3>
          <p className="enterprise-pending-invites-modal-sub">
            {events.length} public {events.length === 1 ? "event needs" : "events need"} your approval
          </p>
        </header>
        {events.length === 0 ? (
          <p className="enterprise-pending-invites-modal-empty">No pending calendar requests.</p>
        ) : (
          <ul className="enterprise-pending-invites-modal-list">
            {events.map((event) => {
              const submitter = event.createdBy?.name ?? event.createdBy?.email ?? "A team member";
              const busy = actionId === event.id;
              return (
                <li key={event.id} className="enterprise-pending-invite-row">
                  <div className="enterprise-pending-invite-row-main">
                    <span className="enterprise-pending-invite-avatar">{submitterInitial(submitter)}</span>
                    <div className="enterprise-pending-invite-copy">
                      <div className="enterprise-pending-invite-line">
                        <strong className="enterprise-pending-invite-email">{event.title}</strong>
                        <span className="enterprise-pending-invite-status">Pending</span>
                      </div>
                      <p className="enterprise-pending-invite-meta">
                        Requested by {submitter}
                        <span aria-hidden> · </span>
                        {formatEventDate(event.startDate)}
                        {event.description?.trim() ? (
                          <>
                            <span aria-hidden> · </span>
                            {event.description.trim()}
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="enterprise-pending-invite-row-actions">
                    <button
                      type="button"
                      className="enterprise-dashboard-btn-outline"
                      disabled={busy}
                      onClick={async () => {
                        onActionStart(event.id);
                        try {
                          await rejectWebTeamEvent(teamId, event.id);
                          await onReload();
                          if (events.length <= 1) onClose();
                        } catch (e) {
                          onError(e instanceof Error ? e.message : "Decline failed.");
                        } finally {
                          onActionEnd();
                        }
                      }}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      className="enterprise-pending-invite-resend"
                      disabled={busy}
                      onClick={async () => {
                        onActionStart(event.id);
                        try {
                          await approveWebTeamEvent(teamId, event.id);
                          await onReload();
                          if (events.length <= 1) onClose();
                        } catch (e) {
                          onError(e instanceof Error ? e.message : "Approve failed.");
                        } finally {
                          onActionEnd();
                        }
                      }}
                    >
                      {busy ? "Approving…" : "Approve"}
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
