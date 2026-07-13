import { useState } from "react";
import { GoDeviceLinkQrCode, buildGoDeviceLinkUrl } from "../GoDeviceLinkQrCode";
import { LinkedGoDevicesPanel } from "../../LinkedGoDevicesPanel";
import { PendingApprovalsPanel } from "../../PendingApprovalsPanel";
import type { usePendingApprovals } from "../../../hooks/usePendingApprovals";

type ApprovalsState = ReturnType<typeof usePendingApprovals>;

type Props = {
  teamId: string | undefined;
  teamName: string;
  inviteCode?: string | null;
  canManage: boolean;
  approvals: ApprovalsState;
};

export function LinkedDevicesAccessPanel({ teamId, teamName, inviteCode, canManage, approvals }: Props) {
  const [copyOk, setCopyOk] = useState(false);

  async function copyCode() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopyOk(true);
      window.setTimeout(() => setCopyOk(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="go-backend-setup-grid">
        <section className="go-backend-module-panel go-backend-panel-card go-backend-setup-card">
          <h2 className="go-backend-devices-section-title">Link a device</h2>
          <p className="go-backend-devices-section-sub enterprise-muted">
            Connect iPads and shared floor devices — no personal login required on the tablet.
          </p>
          <ol className="go-backend-setup-steps">
            <li>
              <strong>Open the linking page</strong> on the tablet browser at{" "}
              <a href="/aleniogo" className="enterprise-inline-link">
                alenio.com/aleniogo
              </a>
              .
            </li>
            <li>
              <strong>Enter your workspace code</strong>
              {inviteCode ? (
                <>
                  {" "}
                  (
                  <button type="button" className="go-backend-inline-code" onClick={() => void copyCode()}>
                    {copyOk ? "Copied!" : inviteCode}
                  </button>
                  )
                </>
              ) : (
                " (available to workspace owners in Team settings)."
              )}
            </li>
            <li>
              <strong>Approve the device</strong> in Pending approval below once the tablet requests access.
            </li>
            <li>
              <strong>Keep the dashboard open</strong> on the tablet so workplace alerts and check-ins stay connected.
            </li>
          </ol>
          <div className="go-backend-setup-actions">
            <a href="/aleniogo" target="_blank" rel="noopener noreferrer" className="enterprise-alenio-go-link-btn">
              Open device linking page
            </a>
          </div>
        </section>

        <aside className="go-backend-module-panel go-backend-panel-card go-backend-setup-aside">
          <h2 className="go-backend-setup-aside-title">Workspace</h2>
          <p className="enterprise-muted go-backend-setup-aside-copy">
            Devices you link will show the Alenio Go dashboard for <strong>{teamName}</strong>.
          </p>
          {inviteCode ? (
            <>
              <GoDeviceLinkQrCode
                url={buildGoDeviceLinkUrl(inviteCode)}
                label="Scan with the tablet camera to open the linking page"
              />
              <dl className="enterprise-alenio-go-meta">
                <div>
                  <dt>Workspace code</dt>
                  <dd>
                    <button type="button" className="go-backend-code-btn go-backend-code-btn--dark" onClick={() => void copyCode()}>
                      {copyOk ? "Copied!" : inviteCode}
                    </button>
                  </dd>
                </div>
              </dl>
            </>
          ) : null}
        </aside>
      </div>

      {canManage && teamId ? (
        <>
          <div className="go-backend-module-panel go-backend-panel-card">
            <h2 className="go-backend-devices-section-title">Linked devices</h2>
            <p className="go-backend-devices-section-sub enterprise-muted">
              Tablets currently connected to this workspace. Unlink a device to revoke its access.
            </p>
            <LinkedGoDevicesPanel teamId={teamId} variant="page" />
          </div>

          <div className="go-backend-module-panel go-backend-panel-card" id="go-device-approvals">
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
            After linking a device, your workspace owner or team leader approves it in Pending approval above.
          </p>
        </div>
      )}
    </>
  );
}
