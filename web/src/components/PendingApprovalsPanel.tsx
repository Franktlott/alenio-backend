import {
  approvalBusyKey,
  formatApprovalDate,
  joinRequesterLabel,
  type PendingGoLoginRow,
  type PendingJoinRow,
} from "../lib/pending-approvals";

type Props = {
  joinRows: PendingJoinRow[];
  goRows: PendingGoLoginRow[];
  loadErr: string | null;
  busyKey: string | null;
  loading?: boolean;
  variant?: "dropdown" | "page";
  emptyMessage?: string;
  onApproveJoin: (teamId: string, requestId: string) => Promise<void>;
  onRejectJoin: (teamId: string, requestId: string) => Promise<void>;
  onApproveGo: (teamId: string, requestId: string) => Promise<void>;
  onRejectGo: (teamId: string, requestId: string) => Promise<void>;
};

function ApprovalActions({
  busy,
  onDecline,
  onApprove,
}: {
  busy: boolean;
  onDecline: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="enterprise-join-requests-actions">
      <button
        type="button"
        className="enterprise-join-requests-btn enterprise-join-requests-btn-decline"
        disabled={busy}
        onClick={onDecline}
      >
        Decline
      </button>
      <button
        type="button"
        className="enterprise-join-requests-btn enterprise-join-requests-btn-approve"
        disabled={busy}
        onClick={onApprove}
      >
        {busy ? "…" : "Approve"}
      </button>
    </div>
  );
}

export function PendingApprovalsPanel({
  joinRows,
  goRows,
  loadErr,
  busyKey,
  loading = false,
  variant = "page",
  emptyMessage = "No pending approvals.",
  onApproveJoin,
  onRejectJoin,
  onApproveGo,
  onRejectGo,
}: Props) {
  const empty = joinRows.length === 0 && goRows.length === 0;
  const isPage = variant === "page";

  if (loading && empty) {
    return <p className="enterprise-muted enterprise-approvals-loading">Loading approvals…</p>;
  }

  if (loadErr) {
    return (
      <p className="enterprise-join-requests-error" role="alert">
        {loadErr}
      </p>
    );
  }

  if (empty) {
    return <p className="enterprise-join-requests-empty">{emptyMessage}</p>;
  }

  return (
    <ul className={`enterprise-join-requests-list${isPage ? " enterprise-join-requests-list--page" : ""}`}>
      {goRows.map((r) => {
        const key = approvalBusyKey("go", r.teamId, r.id);
        const busy = busyKey === key;
        const label = r.deviceLabel?.trim() || "A device";
        return (
          <li key={`go-${r.id}`} className="enterprise-join-requests-item">
            <div className="enterprise-join-requests-item-text">
              {isPage ? (
                <span className="enterprise-approvals-kind">Alenio Go device</span>
              ) : null}
              <strong>{label}</strong>
              <span className="enterprise-muted enterprise-join-requests-meta">
                wants Alenio Go access to <strong>{r.teamName}</strong>
                {isPage ? <> · {formatApprovalDate(r.createdAt)}</> : null}
              </span>
            </div>
            <ApprovalActions
              busy={busy}
              onDecline={() => void onRejectGo(r.teamId, r.id)}
              onApprove={() => void onApproveGo(r.teamId, r.id)}
            />
          </li>
        );
      })}
      {joinRows.map((r) => {
        const key = approvalBusyKey("join", r.teamId, r.id);
        const busy = busyKey === key;
        return (
          <li key={`join-${r.id}`} className="enterprise-join-requests-item">
            <div className="enterprise-join-requests-item-text">
              {isPage ? <span className="enterprise-approvals-kind">Join request</span> : null}
              <strong>{joinRequesterLabel(r.user)}</strong>
              <span className="enterprise-muted enterprise-join-requests-meta">
                wants to join <strong>{r.teamName}</strong>
                {isPage ? <> · {formatApprovalDate(r.createdAt)}</> : null}
              </span>
            </div>
            <ApprovalActions
              busy={busy}
              onDecline={() => void onRejectJoin(r.teamId, r.id)}
              onApprove={() => void onApproveJoin(r.teamId, r.id)}
            />
          </li>
        );
      })}
    </ul>
  );
}
