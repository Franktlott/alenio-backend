import { useOutletContext } from "react-router-dom";
import type { WebEnterpriseOrganization } from "../../lib/api";

export type EnterpriseOrgGoOutletContext = {
  organizationId: string;
  organizationName: string;
  org: WebEnterpriseOrganization;
};

export function useEnterpriseOrgGo(): EnterpriseOrgGoOutletContext {
  const ctx = useOutletContext<EnterpriseOrgGoOutletContext | null>();
  if (!ctx?.organizationId) {
    throw new Error("Enterprise org context is not ready");
  }
  return ctx;
}

/** Soft read while nested shells / loading — returns null until context is available. */
export function useEnterpriseOrgGoOptional(): EnterpriseOrgGoOutletContext | null {
  return useOutletContext<EnterpriseOrgGoOutletContext | null>() ?? null;
}
