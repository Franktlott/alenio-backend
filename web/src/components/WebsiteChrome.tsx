import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MarketingFooter } from "./MarketingFooter";
import {
  MARKETING_CTA_START_FREE,
  type MarketingNavId,
} from "../lib/marketing-constants";

type Props = {
  children: ReactNode;
  activeNav?: MarketingNavId;
  /** Use gradient hero header (home) vs compact bar (pricing, etc.) */
  variant?: "hero" | "bar";
};

export function WebsiteChrome({ children, activeNav, variant = "bar" }: Props) {
  const navClass = (id: MarketingNavId) => (activeNav === id ? "site-v2-nav-active" : undefined);

  const header = (
    <header className={variant === "hero" ? "site-v2-header" : "site-v2-header site-v2-header-bar"}>
      <Link to="/" className="site-v2-brand" aria-label="Alenio home">
        <img
          src={variant === "hero" ? "/alenio-logo-white.png" : "/alenio-logo.png"}
          alt="Alenio"
          className="site-v2-logo-full"
          width={168}
          height={40}
        />
      </Link>
      <nav className="site-v2-nav" aria-label="Primary">
        <a href="/#how-alenio-works" className={navClass("how-it-works")}>
          How Alenio Works
        </a>
        <Link to="/pricing" className={navClass("pricing")}>
          Pricing
        </Link>
        <Link to="/enterprise" className={navClass("enterprise")}>
          Enterprise
        </Link>
        <Link to="/security" className={navClass("security")}>
          Security
        </Link>
      </nav>
      <div className="site-v2-head-actions">
        <Link to="/login" className={variant === "hero" ? "site-v2-login" : "site-v2-login site-v2-login-dark"}>
          Log in
        </Link>
        <Link to="/sign-up" className="site-v2-head-cta">
          {MARKETING_CTA_START_FREE}
        </Link>
      </div>
    </header>
  );

  const footer = <MarketingFooter />;

  if (variant === "hero") {
    return (
      <div className="site-v2">
        {header}
        {children}
        {footer}
      </div>
    );
  }

  return (
    <div className="site-v2 site-v2-page">
      {header}
      {children}
      {footer}
    </div>
  );
}
