import { Link } from "react-router-dom";
import { WebsiteChrome } from "../components/WebsiteChrome";
import { SenecaIcon } from "../components/seneca/SenecaShared";
import {
  ENTERPRISE_PAGE_HERO,
  ENTERPRISE_PAGE_PILLARS,
  MARKETING_CTA_REQUEST_DEMO,
  MARKETING_CTA_START_FREE,
  MARKETING_DEMO_HREF,
} from "../lib/marketing-constants";

export function EnterprisePage() {
  return (
    <WebsiteChrome activeNav="enterprise">
      <main className="site-marketing-main" data-testid="enterprise-page">
        <header className="site-marketing-hero">
          <p className="site-marketing-eyebrow site-marketing-eyebrow-seneca">
            <SenecaIcon size={20} className="site-marketing-eyebrow-seneca-icon" />
            Enterprise · Seneca AI
          </p>
          <h1>{ENTERPRISE_PAGE_HERO.title}</h1>
          <p>{ENTERPRISE_PAGE_HERO.subcopy}</p>
          <div className="site-v2-hero-cta site-marketing-hero-actions">
            <a href={MARKETING_DEMO_HREF} className="site-v2-btn site-v2-btn-primary">
              {MARKETING_CTA_REQUEST_DEMO}
            </a>
            <Link to="/sign-up" className="site-v2-btn site-v2-btn-outline site-marketing-btn-outline">
              {MARKETING_CTA_START_FREE}
            </Link>
          </div>
        </header>

        <section className="site-marketing-pillars" aria-labelledby="enterprise-pillars-heading">
          <h2 id="enterprise-pillars-heading" className="site-marketing-section-title">
            Built for operators at scale
          </h2>
          <div className="site-marketing-pillar-grid">
            {ENTERPRISE_PAGE_PILLARS.map((pillar) => (
              <article key={pillar.title} className="site-marketing-pillar-card">
                <h3>{pillar.title}</h3>
                <ul>
                  {pillar.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="site-marketing-bottom-cta">
          <h2>Ready for a guided rollout?</h2>
          <p>Talk with our team about multi-location deployment, security review, and enterprise support.</p>
          <div className="site-v2-hero-cta site-marketing-hero-actions">
            <a href={MARKETING_DEMO_HREF} className="site-v2-btn site-v2-btn-primary">
              {MARKETING_CTA_REQUEST_DEMO}
            </a>
            <Link to="/security" className="site-v2-btn site-v2-btn-outline site-pricing-btn-on-light">
              View security
            </Link>
          </div>
        </section>
      </main>
    </WebsiteChrome>
  );
}
