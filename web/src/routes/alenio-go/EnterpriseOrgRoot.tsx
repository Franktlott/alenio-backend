import { Outlet } from "react-router-dom";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { primaryEnterpriseOrg } from "../../lib/enterprise-org";

/** Provides enterprise org context for dashboard + corporate standards routes. */
export function EnterpriseOrgRoot() {
  const { me } = useEnterpriseShell();
  const org = primaryEnterpriseOrg(me);

  if (!org) {
    return (
      <div className="enterprise-tab-shell" style={{ padding: "1.5rem" }}>
        <p className="enterprise-muted">No enterprise organization found.</p>
      </div>
    );
  }

  return <Outlet context={{ organizationId: org.id, organizationName: org.name, org }} />;
}
