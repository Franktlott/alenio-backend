import { AlenioGoLogo } from "../components/AlenioGoLogo";
import { PendingApprovalsPanel } from "../components/PendingApprovalsPanel";
import { WorkplaceAlertPanel } from "../components/WorkplaceAlertPanel";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { usePendingApprovals } from "../hooks/usePendingApprovals";
import { canManageApprovals } from "../lib/pending-approvals";

function roleLabelForTeam(role: string | undefined): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  return "Member";
}

export function AlenioGoPage() {
  const { teams, selectedTeamId } = useEnterpriseShell();
  const activeTeam = teams?.find((t) => t.id === selectedTeamId) ?? null;
  const canManage = activeTeam ? canManageApprovals(activeTeam.role) : false;

  const approvals = usePendingApprovals({
    teamId: canManage ? selectedTeamId : undefined,
    pollMs: 15_000,
  });

  return (
    <div className="enterprise-tab-shell enterprise-alenio-go-page" data-testid="alenio-go-page">
      <div className="enterprise-alenio-go-layout">
        {canManage && selectedTeamId ? <WorkplaceAlertPanel teamId={selectedTeamId} /> : null}

        <section className="enterprise-card enterprise-alenio-go-approvals" aria-labelledby="alenio-go-approvals-title">
          <header className="enterprise-alenio-go-approvals-head">
            <div>
              <p className="enterprise-alenio-go-kicker">Alenio Go</p>
              <h1 id="alenio-go-approvals-title" className="enterprise-card-title">
                {canManage ? "Pending approvals" : "Device access"}
              </h1>
              <p className="enterprise-muted enterprise-alenio-go-approvals-sub">
                {canManage
                  ? "Approve devices that entered your workspace code at alenio.app/aleniogo."
                  : "Ask your workspace owner or team leader to approve Alenio Go devices."}
              </p>
            </div>
            {canManage && approvals.total > 0 ? (
              <span className="enterprise-alenio-go-approvals-count">{approvals.total} pending</span>
            ) : null}
          </header>

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
            <p className="enterprise-muted enterprise-alenio-go-member-note">
              Link a store device at{" "}
              <a href="/aleniogo" className="enterprise-inline-link">
                alenio.app/aleniogo
              </a>{" "}
              using your workspace code, then your leaders approve it here.
            </p>
          )}
        </section>

        <aside className="enterprise-card enterprise-alenio-go-side">
          <AlenioGoLogo variant="page" className="enterprise-alenio-go-side-logo" />
          <h2 className="enterprise-alenio-go-side-title">Frontline checklists</h2>
          <p className="enterprise-muted enterprise-alenio-go-side-copy">
            Set up iPads and shared devices for sign-offs, opening routines, and store execution — no personal login
            required on the floor.
          </p>
          {activeTeam ? (
            <dl className="enterprise-alenio-go-meta">
              <div>
                <dt>Workspace</dt>
                <dd>{activeTeam.name}</dd>
              </div>
              <div>
                <dt>Your role</dt>
                <dd>{roleLabelForTeam(activeTeam.role)}</dd>
              </div>
            </dl>
          ) : null}
          <a href="/aleniogo" className="enterprise-alenio-go-link-btn">
            Open device linking page
          </a>
        </aside>
      </div>
    </div>
  );
}
