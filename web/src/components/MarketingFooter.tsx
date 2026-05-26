import { Link } from "react-router-dom";
import {
  LEGAL_COMPANY_NAME,
  LEGAL_CONTACT_EMAIL,
  LEGAL_PARENT_COMPANY_NAME,
} from "../lib/legal-constants";

/** Shared footer for marketing pages (home, pricing, etc.). */
export function MarketingFooter() {
  return (
    <div className="site-v2-footer-wrap">
      <footer id="contact" className="site-v2-footer">
        <div className="site-v2-footer-top">
          <img src="/alenio-logo.png" alt="Alenio" className="site-v2-footer-logo" width={140} height={34} />
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        </div>
        <p className="site-v2-footer-legal">
          <Link to="/privacy">Privacy Policy</Link>
          {" · "}
          <Link to="/terms">Terms of Service</Link>
          {" · "}
          <Link to="/account-deletion">Account deletion</Link>
          {" · "}
          <Link to="/pricing">Pricing</Link>
        </p>
        <p className="site-v2-footer-company">{LEGAL_COMPANY_NAME}</p>
        <p className="site-v2-footer-parent">Parent company: {LEGAL_PARENT_COMPANY_NAME}</p>
      </footer>
    </div>
  );
}
