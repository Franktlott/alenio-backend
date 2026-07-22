import { NavLink, Outlet } from "react-router-dom";
import { useEnterpriseOrgGo } from "./enterprise-org-go-context";

/** Main Dashboard area: Overview + Corporate Workspaces (not corporate standards). */
export function EnterpriseOrgDashboardShell() {
  const { organizationName } = useEnterpriseOrgGo();

  return (
    <div className="enterprise-org-dashboard" data-testid="enterprise-org-dashboard-shell">
      <header className="enterprise-org-dashboard-head">
        <div>
          <p className="enterprise-org-go-eyebrow">Enterprise Dashboard</p>
          <h1 style={{ margin: "0.15rem 0 0.35rem", fontSize: "1.5rem" }}>{organizationName}</h1>
        </div>
        <div
          className="enterprise-workspace-task-view-tabs"
          role="tablist"
          aria-label="Dashboard sections"
        >
          <NavLink
            to="/go/org/overview"
            end
            role="tab"
            className={({ isActive }) =>
              `enterprise-workspace-task-view-tab${isActive ? " enterprise-workspace-task-view-tab-on" : ""}`
            }
            data-testid="enterprise-org-tab-overview"
          >
            Overview
          </NavLink>
          <NavLink
            to="/go/org/workspaces"
            role="tab"
            className={({ isActive }) =>
              `enterprise-workspace-task-view-tab${isActive ? " enterprise-workspace-task-view-tab-on" : ""}`
            }
            data-testid="enterprise-org-tab-corporate-workspaces"
          >
            Corporate Workspaces
          </NavLink>
        </div>
      </header>
      <div className="enterprise-org-dashboard-body">
        <Outlet />
      </div>
    </div>
  );
}
