import { Outlet } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { isEnterpriseOrgMember, primaryEnterpriseOrg } from "../../lib/enterprise-org";

/** Provides enterprise org context for dashboard + corporate standards routes. */
export function EnterpriseOrgRoot() {
  const { me, teams } = useEnterpriseShell();
  const org = primaryEnterpriseOrg(me);

  // Wait for shell me/teams before deciding — avoid flashing errors / null context.
  if (me === undefined || teams === null) {
    return <EnterprisePageLoading label="Loading your enterprise dashboard" />;
  }

  if (!org) {
    if (isEnterpriseOrgMember(me)) {
      return <EnterprisePageLoading label="Loading your enterprise dashboard" />;
    }
    return (
      <div className="enterprise-tab-shell" style={{ padding: "1.5rem" }}>
        <p className="enterprise-muted">No enterprise organization found.</p>
      </div>
    );
  }

  return (
    <Outlet
      context={{
        organizationId: org.id,
        organizationName: org.name,
        org,
      }}
    />
  );
}
