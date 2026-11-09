import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MARKETING_CTA_START_FREE } from "../lib/marketing-constants";

export type SiteIconName =
  | "chat"
  | "check"
  | "calendar"
  | "people"
  | "star"
  | "spark"
  | "layers"
  | "arrow"
  | "play"
  | "chevron"
  | "shield";

export function SiteIcon({ name, size = 20 }: { name: SiteIconName; size?: number }) {
  const paths: Record<SiteIconName, ReactNode> = {
    chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />,
    check: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
        <path d="M8 3v4M16 3v4M3.5 10h17" />
        <path d="M8 14h2M12 14h2M8 17h2" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
      </>
    ),
    star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
    spark: (
      <>
        <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" />
        <path d="M19 15c.3 1.6 1 2.4 2.5 2.7-1.5.3-2.2 1.1-2.5 2.7-.3-1.6-1-2.4-2.5-2.7 1.5-.3 2.2-1.1 2.5-2.7z" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    play: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m10 8.5 5.5 3.5-5.5 3.5z" fill="currentColor" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    shield: (
      <>
        <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" />
        <path d="m8.8 12 2.2 2.2 4.2-4.4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

type NavItem = { label: string; to: string };

function NavLink({ item, className, role }: { item: NavItem; className?: string; role?: string }) {
  if (item.to.startsWith("/#")) {
    return (
      <a href={item.to} className={className} role={role}>
        {item.label}
      </a>
    );
  }
  return (
    <Link to={item.to} className={className} role={role}>
      {item.label}
    </Link>
  );
}

function NavMenu({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <div className="lp-nav-menu">
      <button type="button" className="lp-nav-trigger" aria-haspopup="true">
        {label}
        <SiteIcon name="chevron" size={14} />
      </button>
      <div className="lp-nav-pop" role="menu">
        {items.map((item) => (
          <NavLink key={item.label} item={item} role="menuitem" />
        ))}
      </div>
    </div>
  );
}

export type SiteNavId = "pricing" | "enterprise" | "security";

export function SiteHeader({ active }: { active?: SiteNavId }) {
  const activeClass = (id: SiteNavId) => (active === id ? "is-active" : undefined);
  return (
    <header className="lp-header">
      <Link to="/" className="lp-brand" aria-label="Alenio home">
        <img src="/alenio-logo-white.png" alt="Alenio" width={150} height={36} />
      </Link>
      <nav className="lp-nav" aria-label="Primary">
        <NavMenu
          label="Product"
          items={[
            { label: "Alenio Network", to: "/#network" },
            { label: "Alenio Workspace", to: "/#workspace" },
            { label: "Enterprise", to: "/enterprise" },
            { label: "Security", to: "/security" },
          ]}
        />
        <a href="/#network">Network</a>
        <NavMenu
          label="Workspace"
          items={[
            { label: "Tasks & Execution", to: "/#features" },
            { label: "Scheduling & Events", to: "/#features" },
            { label: "Team Development", to: "/#features" },
            { label: "Recognition & Updates", to: "/#features" },
          ]}
        />
        <a href="/#features">Seneca AI</a>
        <Link to="/pricing" className={activeClass("pricing")}>
          Pricing
        </Link>
      </nav>
      <div className="lp-head-actions">
        <Link to="/login" className="lp-btn lp-btn--ghost lp-btn--sm">
          Log In
        </Link>
        <Link to="/sign-up" className="lp-btn lp-btn--primary lp-btn--sm">
          {MARKETING_CTA_START_FREE}
        </Link>
      </div>
    </header>
  );
}
