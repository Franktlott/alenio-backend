import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MarketingFooter } from "./MarketingFooter";

type NavId = "how-it-works" | "pricing";

type Props = {
  children: ReactNode;
  /** Highlights Pricing in the nav when on /pricing */
  activeNav?: NavId;
  /** Use gradient hero header (home) vs compact bar (pricing, etc.) */
  variant?: "hero" | "bar";
};

export function WebsiteChrome({ children, activeNav, variant = "bar" }: Props) {
  const navClass = (id: NavId) => (activeNav === id ? "site-v2-nav-active" : undefined);

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
      </nav>
      <div className="site-v2-head-actions">
        <Link to="/login" className={variant === "hero" ? "site-v2-login" : "site-v2-login site-v2-login-dark"}>
          Log in
        </Link>
        <Link to="/sign-up" className="site-v2-head-cta">
          Join Alenio
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
