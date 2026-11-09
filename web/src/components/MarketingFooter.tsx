import { Link } from "react-router-dom";
import {
  LEGAL_COMPANY_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_PARENT_COMPANY_NAME,
} from "../lib/legal-constants";

/** Shared footer for marketing pages (home, pricing, etc.). */
export function MarketingFooter() {
  return (
    <footer id="contact" className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <img src="/alenio-logo.png" alt="Alenio" width={140} height={34} />
          <p>Your Network. Your Operations. One Platform.</p>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        </div>
        <nav className="lp-footer-cols" aria-label="Footer">
          <div>
            <strong>Product</strong>
            <a href="/#network">Network</a>
            <a href="/#workspace">Workspace</a>
            <a href="/#features">Seneca AI</a>
            <Link to="/pricing">Pricing</Link>
          </div>
          <div>
            <strong>Company</strong>
            <Link to="/enterprise">Enterprise</Link>
            <Link to="/security">Security</Link>
            <Link to="/login">Log In</Link>
          </div>
          <div>
            <strong>Legal</strong>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/account-deletion">Account deletion</Link>
          </div>
        </nav>
      </div>
      <div className="lp-footer-bottom">
        <span>
          © {new Date().getFullYear()} {LEGAL_COMPANY_NAME}
        </span>
        <span>Parent company: {LEGAL_PARENT_COMPANY_NAME}</span>
      </div>
    </footer>
  );
}
