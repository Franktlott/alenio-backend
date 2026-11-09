import { Link } from "react-router-dom";
import { SiteIcon, type SiteIconName } from "../components/SiteHeader";
import { WebsiteChrome } from "../components/WebsiteChrome";
import {
  MARKETING_CTA_REQUEST_DEMO,
  MARKETING_CTA_START_FREE,
  MARKETING_DEMO_HREF,
  SECURITY_PAGE_HERO,
  SECURITY_PAGE_SECTIONS,
} from "../lib/marketing-constants";
import { LEGAL_CONTACT_EMAIL } from "../lib/legal-constants";

const SECTION_ICONS: SiteIconName[] = ["shield", "layers", "check"];

export function SecurityPage() {
  return (
    <WebsiteChrome
      activeNav="security"
      hero={
        <>
          <p className="lp-badge">Security</p>
          <h1>{SECURITY_PAGE_HERO.title}</h1>
          <p>{SECURITY_PAGE_HERO.subcopy}</p>
          <div className="lp-band-actions">
            <a href={MARKETING_DEMO_HREF} className="lp-btn lp-btn--primary lp-btn--lg">
              {MARKETING_CTA_REQUEST_DEMO}
              <SiteIcon name="arrow" size={18} />
            </a>
            <Link to="/privacy" className="lp-btn lp-btn--ghost lp-btn--lg">
              Privacy Policy
            </Link>
          </div>
        </>
      }
    >
      <main data-testid="security-page">
        <section className="lp-section lp-section--tight" aria-labelledby="security-sections-heading">
          <div className="lp-section-head">
            <p className="lp-kicker">Trust & safety</p>
            <h2 id="security-sections-heading">How we protect your workspace</h2>
          </div>
          <div className="lp-info-grid">
            {SECURITY_PAGE_SECTIONS.map((section, index) => (
              <article key={section.title} className="lp-info-card">
                <span className="lp-info-icon">
                  <SiteIcon name={SECTION_ICONS[index % SECTION_ICONS.length]} size={24} />
                </span>
                <h3>{section.title}</h3>
                <ul className="lp-checks">
                  {section.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-section--tight">
          <div className="lp-notes">
            <h2>Documentation &amp; requests</h2>
            <ul>
              <li>
                Read our <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms of Service</Link>.
              </li>
              <li>
                Users can follow the <Link to="/account-deletion">account deletion</Link> instructions at any time.
              </li>
              <li>
                For security questionnaires or incident reports, email{" "}
                <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
              </li>
            </ul>
          </div>
        </section>

        <section className="lp-section lp-final">
          <div className="lp-final-card">
            <div>
              <h2>Questions about your deployment?</h2>
              <p>Our team can walk through authentication, data handling, and workspace controls with your stakeholders.</p>
            </div>
            <div className="lp-final-actions">
              <a href={MARKETING_DEMO_HREF} className="lp-btn lp-btn--light lp-btn--lg">
                {MARKETING_CTA_REQUEST_DEMO}
                <SiteIcon name="arrow" size={18} />
              </a>
              <Link to="/sign-up" className="lp-btn lp-btn--ghost lp-btn--lg">
                {MARKETING_CTA_START_FREE}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </WebsiteChrome>
  );
}
