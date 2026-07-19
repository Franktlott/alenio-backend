import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function IconOverview() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconChecks() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function IconResults() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15v-4M12 15V8M16 15v-6" />
    </svg>
  );
}

function IconDevices() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function IconLibrary() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconWalks() {
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
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function IconAudit() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconSwitch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7" />
    </svg>
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
  /** Highlight for nested routes (e.g. walks detail/builder) */
  matchPrefix?: string;
}) {
  const location = useLocation();
  const className = `temps-nav-link${soon ? " temps-nav-link--soon" : ""}`;
  const body = (
    <>
      {icon ? <span className="temps-nav-ico">{icon}</span> : null}
      <span>{children}</span>
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

function initials(name: string | null | undefined) {
  const parts = (name ?? "A").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  return (parts[0] ?? "A").slice(0, 2).toUpperCase();
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
          <img src="/AlenioTemp.png" alt="Alenio Temps" width={588} height={156} />
        </button>

        <nav className="temps-nav-scroll">
          <div className="temps-nav-section">
            <p className="temps-nav-section-label">Overview</p>
            <NavItem to="/go/temp-checks/overview" icon={<IconOverview />} soon>
              Dashboard
            </NavItem>
            <NavItem to="/go/temp-checks/today" icon={<IconChecks />} soon>
              Today&apos;s Checks
            </NavItem>
          </div>

          <div className="temps-nav-section">
            <p className="temps-nav-section-label">Build</p>
            <NavItem to="/go/temp-checks/library" matchPrefix="/go/temp-checks/library" icon={<IconLibrary />}>
              Item Library
            </NavItem>
            <NavItem to="/go/temp-checks/walks" matchPrefix="/go/temp-checks/walks" icon={<IconWalks />}>
              Walks
            </NavItem>
            <NavItem to="/go/temp-checks/schedule" icon={<IconSchedule />}>
              Schedules
            </NavItem>
          </div>

          <div className="temps-nav-section">
            <p className="temps-nav-section-label">Monitor</p>
            <NavItem to="/go/temp-checks/results" icon={<IconResults />} soon>
              Results
            </NavItem>
          </div>

          <div className="temps-nav-section">
            <p className="temps-nav-section-label">Hardware</p>
            <NavItem to="/go/devices" icon={<IconDevices />}>
              Devices
            </NavItem>
          </div>

          <div className="temps-nav-section">
            <p className="temps-nav-section-label">Admin</p>
            <NavItem to="/go/temp-checks/settings" icon={<IconSettings />}>
              Settings
            </NavItem>
            <NavItem to="/go/temp-checks/audit" icon={<IconAudit />} soon>
              Audit Log
            </NavItem>
          </div>
        </nav>

        <div className="temps-nav-footer">
          <div className="temps-nav-help">
            <div className="temps-nav-help-top">
              <p>Need help?</p>
              <small>Our AI support assistant</small>
            </div>
            <button type="button" className="temps-nav-seneca">
              <IconChat />
              Ask Seneca
            </button>
          </div>
          <button
            type="button"
            className="temps-nav-user"
            onClick={() => navigate("/go")}
            aria-label="Switch product or workspace"
          >
            <span className="temps-nav-avatar" aria-hidden>
              {initials(goShell.userName)}
            </span>
            <span className="temps-nav-user-copy">
              <strong>{goShell.userName ?? "Leader"}</strong>
              <small>{goShell.teamName}</small>
            </span>
            <span className="temps-nav-user-switch" aria-hidden>
              <IconSwitch />
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
