import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { LinkedGoDevicesPanel } from "../../components/LinkedGoDevicesPanel";
import { PendingApprovalsPanel } from "../../components/PendingApprovalsPanel";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoDevicesModulePage() {
  const { teamId, canManage, approvals } = useAlenioGoShell();

  return (
    <GoBackendModuleShell
      title="Devices & access"
      subtitle={
        canManage
          ? "View linked tablets and approve new devices that enter your workspace code at alenio.app/aleniogo."
          : "Ask your workspace owner or team leader to approve Alenio Go devices."
      }
      tone="violet"
    >
      {canManage && teamId ? (
        <>
          <div className="go-backend-module-panel go-backend-panel-card">
            <h2 className="go-backend-devices-section-title">Linked devices</h2>
            <p className="go-backend-devices-section-sub enterprise-muted">
              Tablets currently connected to this workspace. Unlink a device to revoke its access.
            </p>
            <LinkedGoDevicesPanel teamId={teamId} variant="page" />
          </div>

          <div className="go-backend-module-panel go-backend-panel-card">
            <div className="go-backend-module-panel-badge-row">
              <h2 className="go-backend-devices-section-title">Pending approval</h2>
              {approvals.total > 0 ? (
                <span className="enterprise-alenio-go-approvals-count">{approvals.total} pending</span>
              ) : null}
            </div>
            <p className="go-backend-devices-section-sub enterprise-muted">
              New tablets waiting for your approval before they can open the floor dashboard.
            </p>
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
          </div>
        </>
      ) : (
        <div className="go-backend-module-panel go-backend-panel-card">
          <p className="enterprise-muted go-backend-member-note">
            Link a store device at{" "}
            <a href="/aleniogo" className="enterprise-inline-link">
              alenio.app/aleniogo
            </a>{" "}
            using your workspace code, then your leaders approve it here.
          </p>
        </div>
      )}
    </GoBackendModuleShell>
  );
}
