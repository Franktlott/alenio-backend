import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LEGAL_COMPANY_NAME, LEGAL_PARENT_COMPANY_NAME } from "../lib/legal-constants";

type NavId = "product" | "solutions" | "pricing" | "resources" | "about";

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
        <a href="/#features" className={navClass("product")}>
          Product
        </a>
        <a href="/#industries" className={navClass("solutions")}>
          Solutions
        </a>
        <Link to="/pricing" className={navClass("pricing")}>
          Pricing
        </Link>
        <a href="/#resources" className={navClass("resources")}>
          Resources
        </a>
        <a href="/#about" className={navClass("about")}>
          About
        </a>
      </nav>
      <div className="site-v2-head-actions">
        <Link to="/login" className={variant === "hero" ? "site-v2-login" : "site-v2-login site-v2-login-dark"}>
          Log in
        </Link>
        <Link to="/sign-up" className="site-v2-head-cta">
          Start with Team
        </Link>
      </div>
    </header>
  );

  const footer = (
    <footer id="contact" className="site-v2-footer">
      <div className="site-v2-footer-top">
        <img src="/alenio-logo.png" alt="Alenio" className="site-v2-footer-logo" width={140} height={34} />
        <a href="mailto:info@alenio.app">info@alenio.app</a>
      </div>
      <p className="site-v2-footer-legal">
        <Link to="/privacy">Privacy Policy</Link>
        {" · "}
        <Link to="/terms">Terms of Service</Link>
        {" · "}
        <Link to="/pricing">Pricing</Link>
      </p>
      <p className="site-v2-footer-company">{LEGAL_COMPANY_NAME}</p>
      <p className="site-v2-footer-parent">Parent company: {LEGAL_PARENT_COMPANY_NAME}</p>
    </footer>
  );

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
