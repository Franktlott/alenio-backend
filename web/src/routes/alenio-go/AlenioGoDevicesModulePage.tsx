import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { PendingApprovalsPanel } from "../../components/PendingApprovalsPanel";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoDevicesModulePage() {
  const { canManage, approvals } = useAlenioGoShell();

  return (
    <GoBackendModuleShell
      title="Devices & access"
      subtitle={
        canManage
          ? "Approve tablets that entered your workspace code at alenio.app/aleniogo."
          : "Ask your workspace owner or team leader to approve Alenio Go devices."
      }
      tone="violet"
    >
      <div className="go-backend-module-panel go-backend-panel-card">
        {canManage && approvals.total > 0 ? (
          <div className="go-backend-module-panel-badge-row">
            <span className="enterprise-alenio-go-approvals-count">{approvals.total} pending</span>
          </div>
        ) : null}

        {canManage ? (
          <PendingApprovalsPanel
            variant="page"
            joinRows={approvals.joinRows}
            goRows={approvals.goRows}
            loadErr={approvals.loadErr}
            busyKey={approvals.busyKey}
            loading={approvals.loading}
            emptyMessage="No devices or join requests waiting for approval."
            onApproveJoin={approvals.onApproveJoin}
            onRejectJoin={approvals.onRejectJoin}
            onApproveGo={approvals.onApproveGo}
            onRejectGo={approvals.onRejectGo}
          />
        ) : (
          <p className="enterprise-muted go-backend-member-note">
            Link a store device at{" "}
            <a href="/aleniogo" className="enterprise-inline-link">
              alenio.app/aleniogo
            </a>{" "}
            using your workspace code, then your leaders approve it here.
          </p>
        )}
      </div>
    </GoBackendModuleShell>
  );
}
