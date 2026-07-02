import { useEffect, useRef, useState } from "react";
import { usePendingApprovals } from "../hooks/usePendingApprovals";
import { PendingApprovalsPanel } from "./PendingApprovalsPanel";

type Props = {
  /** Added to the red badge count (e.g. other notification types later). */
  extraNotificationCount?: number;
};

export function JoinRequestBell({ extraNotificationCount = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const {
    joinRows,
    goRows,
    total,
    loadErr,
    busyKey,
    reload,
    onApproveJoin,
    onRejectJoin,
    onApproveGo,
    onRejectGo,
  } = usePendingApprovals({ pollMs: 45_000 });

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

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

  const badgeTotal = total + extraNotificationCount;

  return (
    <div className="enterprise-join-requests-wrap" ref={wrapRef}>
      <button
        type="button"
        className="enterprise-topbar-bell"
        aria-label={badgeTotal > 0 ? `Notifications, ${badgeTotal} pending` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="topbar-notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badgeTotal > 0 ? <span className="enterprise-topbar-badge">{badgeTotal > 9 ? "9+" : badgeTotal}</span> : null}
      </button>
      {open ? (
        <div className="enterprise-join-requests-panel" role="dialog" aria-label="Pending approvals">
          <div className="enterprise-join-requests-panel-head">
            <span className="enterprise-join-requests-panel-title">Approvals</span>
            <span className="enterprise-join-requests-panel-sub">Teams you manage</span>
          </div>
          <PendingApprovalsPanel
            variant="dropdown"
            joinRows={joinRows}
            goRows={goRows}
            loadErr={loadErr}
            busyKey={busyKey}
            onApproveJoin={onApproveJoin}
            onRejectJoin={onRejectJoin}
            onApproveGo={onApproveGo}
            onRejectGo={onRejectGo}
          />
        </div>
      ) : null}
    </div>
  );
}
