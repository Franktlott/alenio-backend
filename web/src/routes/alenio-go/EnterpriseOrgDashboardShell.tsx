import { Outlet } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseOrgGoOptional } from "./enterprise-org-go-context";

/** Shared chrome for enterprise Dashboard / Workspaces / Users (sidebar owns section nav). */
export function EnterpriseOrgDashboardShell() {
  const ctx = useEnterpriseOrgGoOptional();

  if (!ctx) {
    return <EnterprisePageLoading label="Loading your enterprise dashboard" />;
  }

  return (
    <div className="enterprise-org-dashboard" data-testid="enterprise-org-dashboard-shell">
      <header className="enterprise-org-dashboard-head">
        <div>
          <p className="enterprise-org-go-eyebrow">Enterprise Dashboard</p>
          <h1 style={{ margin: "0.15rem 0 0.35rem", fontSize: "1.5rem" }}>{ctx.organizationName}</h1>
        </div>
      </header>
      <div className="enterprise-org-dashboard-body">
        <Outlet />
      </div>
    </div>
  );
}
