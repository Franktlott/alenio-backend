import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrgGoOverview } from "../../lib/api";
import { useEnterpriseOrgGo } from "./enterprise-org-go-context";

export function EnterpriseOrgGoOverviewPage() {
  const { organizationId, organizationName } = useEnterpriseOrgGo();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOrgGoOverview>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchOrgGoOverview(organizationId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load overview");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return (
    <div className="enterprise-org-go-page" data-testid="enterprise-org-go-overview">
      <header className="enterprise-org-go-page-head">
        <div>
          <p className="enterprise-org-go-eyebrow">Alenio Go · Organization</p>
          <h1>Overview</h1>
          <p className="enterprise-muted">
            Corporate standards for {organizationName}. Assign modules once, configure locally at each workspace.
          </p>
        </div>
      </header>

      {err ? <p className="auth-error">{err}</p> : null}

      <div className="enterprise-org-go-stats">
        <div className="enterprise-card enterprise-org-go-stat">
          <span className="enterprise-muted">Workspaces</span>
          <strong>{data?.workspaceCount ?? "—"}</strong>
        </div>
        <div className="enterprise-card enterprise-org-go-stat">
          <span className="enterprise-muted">Published modules</span>
          <strong>{data?.publishedModuleCount ?? "—"}</strong>
        </div>
        <div className="enterprise-card enterprise-org-go-stat">
          <span className="enterprise-muted">Library items</span>
          <strong>{data?.libraryItemCount ?? "—"}</strong>
        </div>
        <div className="enterprise-card enterprise-org-go-stat">
          <span className="enterprise-muted">Workspaces with assignments</span>
          <strong>{data?.workspacesWithAssignments ?? "—"}</strong>
        </div>
      </div>

      <div className="enterprise-org-go-actions">
        <Link to="/go/org/modules" className="auth-submit">
          Manage modules
        </Link>
        <Link to="/go/org/library" className="enterprise-team-btn-outline">
          Item library
        </Link>
        <Link to="/go/org/workspaces" className="enterprise-team-btn-outline">
          Workspaces
        </Link>
      </div>
    </div>
  );
}
