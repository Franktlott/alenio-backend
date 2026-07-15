import { Link, Navigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { senecaStudioAccess } from "../../lib/seneca-studio-api";

export function SettingsAiHubPage() {
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const team = teams?.find((t) => t.id === selectedTeamId) ?? teams?.[0];
  const access = senecaStudioAccess(team?.role);

  if (me === undefined || teams === null) {
    return <EnterprisePageLoading label="Loading AI settings" />;
  }

  if (!access.canView) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <div className="enterprise-tab-shell seneca-studio-page" data-testid="settings-ai-hub">
      <div className="seneca-studio-page-inner">
        <nav className="seneca-studio-breadcrumb" aria-label="Breadcrumb">
          <Link to="/settings">Settings</Link>
          <span aria-hidden>›</span>
          <span>AI</span>
        </nav>

        <header className="seneca-studio-header">
          <div>
            <h1 className="seneca-studio-title">AI</h1>
            <p className="seneca-studio-subtitle">
              Workspace context Seneca should keep in mind for {team?.name ?? "this workspace"}.
              Platform coaching defaults live in Admin → Seneca Studio.
            </p>
          </div>
          {!access.canEdit ? (
            <span className="seneca-studio-badge seneca-studio-badge--readonly">View only</span>
          ) : null}
        </header>

        <div className="seneca-studio-hub-grid">
          <Link
            to="/settings/ai/workspace-context"
            className="seneca-studio-hub-card"
            data-testid="settings-ai-workspace-context-card"
          >
            <span className="seneca-studio-hub-card-icon" aria-hidden>
              ◈
            </span>
            <h2 className="seneca-studio-hub-card-title">Workspace Context</h2>
            <p className="seneca-studio-hub-card-desc">
              Priorities, goals, initiatives, and recognition preferences Seneca should keep in mind.
            </p>
            <span className="seneca-studio-hub-card-cta">Edit context →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
