import { NavLink, Outlet } from "react-router-dom";
import { AlenioGoLogo } from "../../components/AlenioGoLogo";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { primaryEnterpriseOrg } from "../../lib/enterprise-org";

const NAV: Array<{ to: string; label: string; end?: boolean; soon?: boolean }> = [
  { to: "/go/org/overview", label: "Overview", end: true },
  { to: "/go/org/modules", label: "Modules" },
  { to: "/go/org/library", label: "Item Library" },
  { to: "/go/org/templates", label: "Templates", soon: true },
  { to: "/go/org/procedures", label: "Procedures", soon: true },
  { to: "/go/org/devices", label: "Devices", soon: true },
  { to: "/go/org/policies", label: "Policies", soon: true },
  { to: "/go/org/reports", label: "Reports", soon: true },
  { to: "/go/org/workspaces", label: "Workspaces" },
];

export function EnterpriseOrgGoLayout() {
  const { me } = useEnterpriseShell();
  const org = primaryEnterpriseOrg(me);

  if (!org) {
    return (
      <div className="enterprise-tab-shell" style={{ padding: "1.5rem" }}>
        <p className="enterprise-muted">No enterprise organization found.</p>
      </div>
    );
  }

  return (
    <div className="enterprise-org-go" data-testid="enterprise-org-go-layout">
      <aside className="enterprise-org-go-nav" aria-label="Organization Alenio Go">
        <div className="enterprise-org-go-nav-brand">
          <AlenioGoLogo />
          <div>
            <p className="enterprise-org-go-eyebrow">Corporate standards</p>
            <strong>{org.name}</strong>
          </div>
        </div>
        <nav className="enterprise-org-go-nav-links">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `enterprise-org-go-link${isActive ? " is-active" : ""}${item.soon ? " is-soon" : ""}`
              }
            >
              {item.label}
              {item.soon ? <span className="enterprise-org-go-soon">Soon</span> : null}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="enterprise-org-go-main">
        <Outlet context={{ organizationId: org.id, organizationName: org.name, org }} />
      </div>
    </div>
  );
}
