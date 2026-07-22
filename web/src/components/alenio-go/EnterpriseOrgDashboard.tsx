import type { ReactNode } from "react";
import { AlenioGoLogo } from "../AlenioGoLogo";
import type { WebEnterpriseOrganization } from "../../lib/api";

export type EnterpriseOrgDashboardTab = "dashboard" | "workspaces";

type OrgTeam = WebEnterpriseOrganization["teams"][number] & {
  organizationName?: string;
};

type Props = {
  organizationName: string;
  workspaceLimit: number;
  workspaceCount: number;
  canCreateWorkspaces: boolean;
  teams: OrgTeam[];
  activeTab: EnterpriseOrgDashboardTab;
  onTabChange: (tab: EnterpriseOrgDashboardTab) => void;
  onSelectWorkspace: (teamId: string) => void;
  onNewWorkspace: () => void;
  workspacesPanel: ReactNode;
};

export function EnterpriseOrgDashboard({
  organizationName,
  workspaceLimit,
  workspaceCount,
  canCreateWorkspaces,
  teams,
  activeTab,
  onTabChange,
  onSelectWorkspace,
  onNewWorkspace,
  workspacesPanel,
}: Props) {
  const readyCount = teams.filter((t) => t.hasGoFeatures).length;
  const pendingCount = teams.length - readyCount;
  const remaining = Math.max(0, workspaceLimit - workspaceCount);

  return (
    <div className="enterprise-tab-shell" data-testid="enterprise-org-dashboard" style={{ padding: "1.5rem" }}>
      <header style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.85rem" }}>
          <AlenioGoLogo />
          <div>
            <p
              className="enterprise-muted"
              style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Enterprise
            </p>
            <h1 style={{ margin: 0, fontSize: "1.35rem" }}>Enterprise Dashboard</h1>
            <p className="enterprise-muted" style={{ margin: "0.25rem 0 0", fontSize: 14 }}>
              {organizationName}
            </p>
          </div>
        </div>

        <div
          className="enterprise-workspace-task-view-tabs"
          role="tablist"
          aria-label="Enterprise Dashboard sections"
          style={{ marginBottom: "0.25rem" }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "dashboard"}
            className={`enterprise-workspace-task-view-tab${
              activeTab === "dashboard" ? " enterprise-workspace-task-view-tab-on" : ""
            }`}
            onClick={() => onTabChange("dashboard")}
            data-testid="enterprise-org-tab-dashboard"
          >
            Dashboard
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "workspaces"}
            className={`enterprise-workspace-task-view-tab${
              activeTab === "workspaces" ? " enterprise-workspace-task-view-tab-on" : ""
            }`}
            onClick={() => onTabChange("workspaces")}
            data-testid="enterprise-org-tab-workspaces"
          >
            Workspaces
            <span className="enterprise-workspace-task-view-tab-count">{workspaceCount}</span>
          </button>
        </div>
      </header>

      {activeTab === "dashboard" ? (
        <div data-testid="enterprise-org-dashboard-panel">
          <p className="enterprise-muted" style={{ margin: "0 0 1rem", maxWidth: 640 }}>
            Overview of {organizationName}. Open a workspace to configure Alenio Go, or manage workspaces from the
            Workspaces tab.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <div className="enterprise-card" style={{ padding: "1rem" }}>
              <p className="enterprise-muted" style={{ margin: 0, fontSize: 12, textTransform: "uppercase" }}>
                Workspaces
              </p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>
                {workspaceCount}
                <span className="enterprise-muted" style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                  {" "}
                  / {workspaceLimit}
                </span>
              </p>
            </div>
            <div className="enterprise-card" style={{ padding: "1rem" }}>
              <p className="enterprise-muted" style={{ margin: 0, fontSize: 12, textTransform: "uppercase" }}>
                Go ready
              </p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>{readyCount}</p>
            </div>
            <div className="enterprise-card" style={{ padding: "1rem" }}>
              <p className="enterprise-muted" style={{ margin: 0, fontSize: 12, textTransform: "uppercase" }}>
                Remaining slots
              </p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>{remaining}</p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginBottom: "1.25rem",
            }}
          >
            <button
              type="button"
              className="auth-submit"
              onClick={() => onTabChange("workspaces")}
              data-testid="enterprise-org-manage-workspaces"
            >
              Manage workspaces
            </button>
            {canCreateWorkspaces ? (
              <button
                type="button"
                className="enterprise-team-btn-outline"
                onClick={onNewWorkspace}
                data-testid="enterprise-org-dashboard-new-workspace"
              >
                New workspace
              </button>
            ) : null}
          </div>

          {pendingCount > 0 ? (
            <p className="enterprise-muted" style={{ marginBottom: "1rem" }}>
              {pendingCount} workspace{pendingCount === 1 ? "" : "s"} still pending Go features.
            </p>
          ) : null}

          {teams.length === 0 ? (
            <div className="enterprise-card" style={{ padding: "1.25rem" }}>
              <h2 className="enterprise-card-title" style={{ marginBottom: "0.5rem" }}>
                No workspaces yet
              </h2>
              <p className="enterprise-muted" style={{ margin: "0 0 0.85rem" }}>
                Create your first workspace to start setting up Alenio Go for {organizationName}.
              </p>
              {canCreateWorkspaces ? (
                <button type="button" className="auth-submit" onClick={onNewWorkspace}>
                  Create a workspace
                </button>
              ) : null}
            </div>
          ) : (
            <div className="enterprise-table-wrap">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>Workspace</th>
                    <th>Code</th>
                    <th>Go</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id}>
                      <td>
                        <strong>{team.name}</strong>
                      </td>
                      <td>{team.inviteCode ?? "—"}</td>
                      <td>{team.hasGoFeatures ? "Ready" : "Features pending"}</td>
                      <td>
                        <button
                          type="button"
                          className="auth-submit"
                          style={{ padding: "0.4rem 0.85rem", fontSize: 13 }}
                          onClick={() => onSelectWorkspace(team.id)}
                          data-testid={`enterprise-org-dashboard-open-${team.id}`}
                        >
                          Open Go
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div data-testid="enterprise-org-workspaces-panel">{workspacesPanel}</div>
      )}
    </div>
  );
}
