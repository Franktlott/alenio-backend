import { useOutletContext } from "react-router-dom";
import type { WebEnterpriseOrganization } from "../../lib/api";

export type EnterpriseOrgGoOutletContext = {
  organizationId: string;
  organizationName: string;
  org: WebEnterpriseOrganization;
};

export function useEnterpriseOrgGo() {
  return useOutletContext<EnterpriseOrgGoOutletContext>();
}
