import { useState } from "react";
import { Link } from "react-router-dom";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoSetupModulePage() {
  const { inviteCode, teamName } = useAlenioGoShell();
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
    <GoBackendModuleShell
      title="Device setup"
      subtitle="Connect iPads and shared floor devices to your workspace — no personal login required on the tablet."
      tone="emerald"
    >
      <div className="go-backend-setup-grid">
        <section className="go-backend-module-panel go-backend-panel-card go-backend-setup-card">
          <ol className="go-backend-setup-steps">
            <li>
              <strong>Open the linking page</strong> on the tablet browser at{" "}
              <a href="/aleniogo" className="enterprise-inline-link">
                alenio.app/aleniogo
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
              <strong>Approve the device</strong> from the Devices & access module once the tablet requests access.
            </li>
            <li>
              <strong>Keep the dashboard open</strong> on the tablet so workplace alerts and check-ins stay connected.
            </li>
          </ol>
          <div className="go-backend-setup-actions">
            <a href="/aleniogo" target="_blank" rel="noopener noreferrer" className="enterprise-alenio-go-link-btn">
              Open device linking page
            </a>
            <Link to="/go/devices" className="go-backend-setup-secondary">
              Go to Devices & access
            </Link>
          </div>
        </section>

        <aside className="go-backend-module-panel go-backend-panel-card go-backend-setup-aside">
          <h2 className="go-backend-setup-aside-title">Workspace</h2>
          <p className="enterprise-muted go-backend-setup-aside-copy">
            Devices you link will show the Alenio Go dashboard for <strong>{teamName}</strong>.
          </p>
          {inviteCode ? (
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
          ) : null}
        </aside>
      </div>
    </GoBackendModuleShell>
  );
}
