import { NavLink, Outlet } from "react-router-dom";
import { AlenioGoLogo } from "../../components/AlenioGoLogo";
import { useEnterpriseOrgGo } from "./enterprise-org-go-context";

const NAV: Array<{ to: string; label: string; soon?: boolean }> = [
  { to: "/go/org/modules", label: "Modules" },
  { to: "/go/org/library", label: "Item Library" },
  { to: "/go/org/templates", label: "Templates", soon: true },
  { to: "/go/org/procedures", label: "Procedures", soon: true },
  { to: "/go/org/devices", label: "Devices", soon: true },
  { to: "/go/org/policies", label: "Policies", soon: true },
  { to: "/go/org/reports", label: "Reports", soon: true },
];

/** Corporate standards chrome (modules, library, etc.) — workspaces live on the Dashboard. */
export function EnterpriseOrgGoLayout() {
  const { organizationName } = useEnterpriseOrgGo();

  return (
    <div className="enterprise-org-go" data-testid="enterprise-org-go-layout">
      <aside className="enterprise-org-go-nav" aria-label="Corporate standards">
        <div className="enterprise-org-go-nav-brand">
          <AlenioGoLogo />
          <div>
            <p className="enterprise-org-go-eyebrow">Corporate standards</p>
            <strong>{organizationName}</strong>
          </div>
        </div>
        <nav className="enterprise-org-go-nav-links">
          <NavLink
            to="/go/org/overview"
            className="enterprise-org-go-link enterprise-org-go-link--back"
          >
            ← Dashboard
          </NavLink>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
        <Outlet />
      </div>
    </div>
  );
}
