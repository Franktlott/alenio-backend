import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrgGoOverview } from "../../lib/api";
import { useEnterpriseOrgGo } from "./enterprise-org-go-context";

export function EnterpriseOrgGoOverviewPage() {
  const { organizationId } = useEnterpriseOrgGo();
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
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Overview</h2>
          <p className="enterprise-muted" style={{ margin: "0.35rem 0 0" }}>
            Assign modules once under Corporate standards, then configure locally at each workspace.
          </p>
        </div>
      </header>

      {err ? <p className="auth-error">{err}</p> : null}

      <div className="enterprise-org-go-stats">
        <div className="enterprise-card enterprise-org-go-stat">
          <span className="enterprise-muted">Corporate workspaces</span>
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
        <Link to="/go/org/modules" className="enterprise-team-btn-outline" style={{ width: "auto" }}>
          Corporate standards
        </Link>
        <Link to="/go/org/workspaces" className="enterprise-team-btn-outline" style={{ width: "auto" }}>
          Corporate Workspaces
        </Link>
      </div>
    </div>
  );
}
