import type { ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
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

function IconSchedule() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
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

function IconTemp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
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

function IconCollapse() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function NavItem({
  to,
  end,
  icon,
  children,
  soon,
  sub,
}: {
  to: string;
  end?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  soon?: boolean;
  sub?: boolean;
}) {
  const className = `temps-nav-link${sub ? " temps-nav-link--sub" : ""}${soon ? " temps-nav-link--soon" : ""}`;
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
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `${className}${isActive ? " is-active" : ""}`}
    >
      {body}
    </NavLink>
  );
}

export function TempsModuleLayout() {
  const goShell = useAlenioGoShell();
  const navigate = useNavigate();

  return (
    <div className="temps-module" data-testid="temps-module-shell">
      <aside className="temps-nav" aria-label="Alenio Temps navigation">
        <div className="temps-nav-brand">
          <img src="/icon.png" alt="" width={28} height={28} />
          <strong>Alenio</strong>
        </div>

        <button type="button" className="temps-nav-product" aria-label="Product">
          <span className="temps-nav-product-ico">
            <IconTemp />
          </span>
          <span className="temps-nav-product-copy">
            <em>Alenio Temps</em>
            <small>{goShell.teamName}</small>
          </span>
          <span className="temps-nav-caret" aria-hidden>
            ▾
          </span>
        </button>

        <nav className="temps-nav-scroll">
          <div className="temps-nav-group">
            <NavItem to="/go/temp-checks/overview" icon={<IconOverview />} soon>
              Overview
            </NavItem>
            <NavItem to="/go/temp-checks/today" icon={<IconChecks />} soon>
              Today&apos;s Checks
            </NavItem>
            <NavItem to="/go/temp-checks/schedule" icon={<IconSchedule />} soon>
              Schedule
            </NavItem>
            <NavItem to="/go/temp-checks/results" icon={<IconResults />} soon>
              Results
            </NavItem>
            <NavItem to="/go/devices" icon={<IconDevices />}>
              Devices
            </NavItem>
          </div>

          <div className="temps-nav-section">
            <p className="temps-nav-section-label">Items</p>
            <NavItem to="/go/temp-checks/library" end icon={<IconLibrary />}>
              Item Library
            </NavItem>
            <div className="temps-nav-sub">
              <NavItem to="/go/temp-checks/categories" sub soon>
                Categories
              </NavItem>
              <NavItem to="/go/temp-checks/tags" sub soon>
                Tags
              </NavItem>
            </div>
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
            <p>Need help?</p>
            <button type="button" className="temps-nav-seneca">
              <IconChat />
              Ask Seneca
            </button>
          </div>
          <button
            type="button"
            className="temps-nav-collapse"
            onClick={() => navigate("/go")}
            aria-label="Back to Alenio Go"
          >
            <IconCollapse />
            Back to Go
          </button>
        </div>
      </aside>

      <div className="temps-module-main">
        <Outlet context={goShell} />
      </div>
    </div>
  );
}
