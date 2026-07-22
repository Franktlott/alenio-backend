import { createContext, useContext, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import type { WebEnterpriseOrganization } from "../../lib/api";
import { isEnterpriseOrgMember, primaryEnterpriseOrg } from "../../lib/enterprise-org";

export type EnterpriseOrgGoOutletContext = {
  organizationId: string;
  organizationName: string;
  org: WebEnterpriseOrganization;
};

const EnterpriseOrgContext = createContext<EnterpriseOrgGoOutletContext | null>(null);

export function useEnterpriseOrgGo(): EnterpriseOrgGoOutletContext {
  const ctx = useContext(EnterpriseOrgContext);
  if (!ctx) {
    throw new Error("useEnterpriseOrgGo must be used within EnterpriseOrgRoot");
  }
  return ctx;
}

export function useEnterpriseOrgGoOptional(): EnterpriseOrgGoOutletContext | null {
  return useContext(EnterpriseOrgContext);
}

/** Provides enterprise org context for dashboard + corporate standards routes. */
export function EnterpriseOrgRoot() {
  const { me, teams } = useEnterpriseShell();
  const org = primaryEnterpriseOrg(me);

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

  const value: EnterpriseOrgGoOutletContext = {
    organizationId: org.id,
    organizationName: org.name,
    org,
  };

  return (
    <EnterpriseOrgContext.Provider value={value}>
      <Outlet />
    </EnterpriseOrgContext.Provider>
  );
}

export function EnterpriseOrgLoadingGate({
  label = "Loading your enterprise dashboard",
  children,
}: {
  label?: string;
  children: (ctx: EnterpriseOrgGoOutletContext) => ReactNode;
}) {
  const ctx = useEnterpriseOrgGoOptional();
  if (!ctx) return <EnterprisePageLoading label={label} />;
  return <>{children(ctx)}</>;
}
