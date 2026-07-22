import { useEnterpriseOrgGo } from "./enterprise-org-go-context";

type Props = { title: string };

export function EnterpriseOrgGoStubPage({ title }: Props) {
  const { organizationName } = useEnterpriseOrgGo();
  return (
    <div className="enterprise-org-go-page" data-testid="enterprise-org-go-stub">
      <header className="enterprise-org-go-page-head">
        <div>
          <p className="enterprise-org-go-eyebrow">Coming later</p>
          <h1>{title}</h1>
          <p className="enterprise-muted">
            {title} for {organizationName} will ship in a later phase of organization-first Alenio Go. Phase 1 focuses on
            Modules, Item Library, and workspace configuration.
          </p>
        </div>
      </header>
      <div className="enterprise-card" style={{ padding: "1.25rem" }}>
        <p className="enterprise-muted" style={{ margin: 0 }}>
          Use Modules and Item Library for corporate standards. Manage stores from Dashboard → Corporate Workspaces.
        </p>
      </div>
    </div>
  );
}
