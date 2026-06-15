import { Link } from "react-router-dom";
import { WebsiteChrome } from "../components/WebsiteChrome";
import {
  MARKETING_CTA_REQUEST_DEMO,
  MARKETING_CTA_START_FREE,
  MARKETING_DEMO_HREF,
  SECURITY_PAGE_HERO,
  SECURITY_PAGE_SECTIONS,
} from "../lib/marketing-constants";
import { LEGAL_CONTACT_EMAIL } from "../lib/legal-constants";

export function SecurityPage() {
  return (
    <WebsiteChrome activeNav="security">
      <main className="site-marketing-main" data-testid="security-page">
        <header className="site-marketing-hero">
          <p className="site-marketing-eyebrow">Security</p>
          <h1>{SECURITY_PAGE_HERO.title}</h1>
          <p>{SECURITY_PAGE_HERO.subcopy}</p>
          <div className="site-v2-hero-cta site-marketing-hero-actions">
            <a href={MARKETING_DEMO_HREF} className="site-v2-btn site-v2-btn-primary">
              {MARKETING_CTA_REQUEST_DEMO}
            </a>
            <Link to="/privacy" className="site-v2-btn site-v2-btn-outline site-marketing-btn-outline">
              Privacy Policy
            </Link>
          </div>
        </header>

        <section className="site-marketing-security-grid" aria-labelledby="security-sections-heading">
          <h2 id="security-sections-heading" className="site-marketing-section-title">
            How we protect your workspace
          </h2>
          <div className="site-marketing-pillar-grid">
            {SECURITY_PAGE_SECTIONS.map((section) => (
              <article key={section.title} className="site-marketing-pillar-card">
                <h3>{section.title}</h3>
                <ul>
                  {section.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="site-marketing-notes">
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
        </section>

        <section className="site-marketing-bottom-cta">
          <h2>Questions about your deployment?</h2>
          <p>Our team can walk through authentication, data handling, and workspace controls with your stakeholders.</p>
          <div className="site-v2-hero-cta site-marketing-hero-actions">
            <a href={MARKETING_DEMO_HREF} className="site-v2-btn site-v2-btn-primary">
              {MARKETING_CTA_REQUEST_DEMO}
            </a>
            <Link to="/sign-up" className="site-v2-btn site-v2-btn-outline site-pricing-btn-on-light">
              {MARKETING_CTA_START_FREE}
            </Link>
          </div>
        </section>
      </main>
    </WebsiteChrome>
  );
}
