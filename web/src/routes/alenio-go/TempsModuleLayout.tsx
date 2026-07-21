import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  );
}

function IconItems() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconChecklists() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function IconSchedule() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}

function IconReports() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15v-4M12 15V8M16 15v-6" />
    </svg>
  );
}

function IconLocations() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function TempsBrandMark() {
  return (
    <span className="temps-nav-brand">
      <svg className="temps-nav-brand-icon" viewBox="0 0 32 48" fill="none" aria-hidden>
        <path
          d="M16 3c-2.4 0-4.4 1.9-4.4 4.3v22.2a7.4 7.4 0 1 0 8.8 0V7.3C20.4 4.9 18.4 3 16 3Z"
          stroke="#5EC8F0"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M16 10v18.5" stroke="#F8FAFC" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="36.5" r="5.2" fill="#2EB7F0" />
      </svg>
      <span className="temps-nav-brand-copy">
        <strong>TEMPS</strong>
        <small>Food Safety</small>
      </span>
    </span>
  );
}

function NavItem({
  to,
  end,
  icon,
  children,
  soon,
  matchPrefix,
}: {
  to: string;
  end?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  soon?: boolean;
  matchPrefix?: string;
}) {
  const location = useLocation();
  const className = `temps-nav-link${soon ? " temps-nav-link--soon" : ""}`;
  const body = (
    <>
      {icon ? <span className="temps-nav-ico">{icon}</span> : null}
      <span className="temps-nav-label">{children}</span>
    </>
  );
  if (soon) {
    return (
      <span className={className} title="Coming next">
        {body}
      </span>
    );
  }
  const prefixed =
    matchPrefix != null &&
    (location.pathname === matchPrefix || location.pathname.startsWith(`${matchPrefix}/`));
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `${className}${isActive || prefixed ? " is-active" : ""}`}
    >
      {body}
    </NavLink>
  );
}

export function TempsModuleLayout() {
  const goShell = useAlenioGoShell();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className={`temps-module${navOpen ? " temps-module--nav-open" : ""}`} data-testid="temps-module-shell">
      {navOpen ? (
        <button
          type="button"
          className="temps-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside className="temps-nav" id="temps-nav-drawer" aria-label="Alenio Temps navigation">
        <button
          type="button"
          className="temps-nav-logo"
          aria-label="Back to Alenio Go"
          onClick={() => navigate("/go")}
        >
          <TempsBrandMark />
        </button>

        <nav className="temps-nav-scroll">
          <div className="temps-nav-section">
            <NavItem to="/go/temp-checks/overview" end icon={<IconDashboard />}>
              Dashboard
            </NavItem>
          </div>

          <div className="temps-nav-section">
            <p className="temps-nav-section-label">Build</p>
            <NavItem to="/go/temp-checks/library" matchPrefix="/go/temp-checks/library" icon={<IconItems />}>
              Item Library
            </NavItem>
            <NavItem to="/go/temp-checks/walks" matchPrefix="/go/temp-checks/walks" icon={<IconChecklists />}>
              Checklists
            </NavItem>
            <NavItem to="/go/temp-checks/schedule" icon={<IconSchedule />}>
              Schedule
            </NavItem>
          </div>

          <div className="temps-nav-section">
            <p className="temps-nav-section-label">Insights</p>
            <NavItem to="/go/temp-checks/reports" icon={<IconReports />}>
              Reports
            </NavItem>
          </div>
        </nav>

        <div className="temps-nav-footer">
          <button
            type="button"
            className="temps-nav-workspace"
            onClick={() => navigate("/go")}
            aria-label="Switch workspace"
          >
            <span className="temps-nav-workspace-rows">
              <span className="temps-nav-workspace-row">
                <span className="temps-nav-workspace-ico" aria-hidden>
                  <IconLocations />
                </span>
                <strong>{goShell.teamName}</strong>
              </span>
              <span className="temps-nav-workspace-row">
                <span className="temps-nav-workspace-ico" aria-hidden>
                  <IconUser />
                </span>
                <strong>{goShell.userName ?? "Leader"}</strong>
              </span>
            </span>
            <span className="temps-nav-workspace-chevron" aria-hidden>
              <IconChevronRight />
            </span>
          </button>
        </div>
      </aside>

      <div className="temps-module-main">
        <div className="temps-mobile-bar">
          <button
            type="button"
            className="temps-mobile-menu"
            aria-expanded={navOpen}
            aria-controls="temps-nav-drawer"
            onClick={() => setNavOpen((open) => !open)}
          >
            Menu
          </button>
          <span className="temps-mobile-bar-title">
            Alenio <em>Temps</em>
          </span>
        </div>
        <Outlet context={goShell} />
      </div>
    </div>
  );
}
