import { Link } from "react-router-dom";
import { SiteIcon, type SiteIconName } from "../components/SiteHeader";
import { WebsiteChrome } from "../components/WebsiteChrome";
import {
  ENTERPRISE_PAGE_HERO,
  ENTERPRISE_PAGE_PILLARS,
  MARKETING_CTA_REQUEST_DEMO,
  MARKETING_CTA_START_FREE,
  MARKETING_DEMO_HREF,
} from "../lib/marketing-constants";

const PILLAR_ICONS: SiteIconName[] = ["layers", "spark", "people"];

export function EnterprisePage() {
  return (
    <WebsiteChrome
      activeNav="enterprise"
      hero={
        <>
          <p className="lp-badge">
            Enterprise <span>+</span> Seneca AI
          </p>
          <h1>{ENTERPRISE_PAGE_HERO.title}</h1>
          <p>{ENTERPRISE_PAGE_HERO.subcopy}</p>
          <div className="lp-band-actions">
            <a href={MARKETING_DEMO_HREF} className="lp-btn lp-btn--primary lp-btn--lg">
              {MARKETING_CTA_REQUEST_DEMO}
              <SiteIcon name="arrow" size={18} />
            </a>
            <Link to="/sign-up" className="lp-btn lp-btn--ghost lp-btn--lg">
              {MARKETING_CTA_START_FREE}
            </Link>
          </div>
        </>
      }
    >
      <main data-testid="enterprise-page">
        <section className="lp-section lp-section--tight" aria-labelledby="enterprise-pillars-heading">
          <div className="lp-section-head">
            <p className="lp-kicker">Multi-location rollout</p>
            <h2 id="enterprise-pillars-heading">Built for operators at scale</h2>
          </div>
          <div className="lp-info-grid">
            {ENTERPRISE_PAGE_PILLARS.map((pillar, index) => (
              <article key={pillar.title} className="lp-info-card">
                <span className="lp-info-icon">
                  <SiteIcon name={PILLAR_ICONS[index % PILLAR_ICONS.length]} size={24} />
                </span>
                <h3>{pillar.title}</h3>
                <ul className="lp-checks">
                  {pillar.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-final">
          <div className="lp-final-card">
            <div>
              <h2>Ready for a guided rollout?</h2>
              <p>Talk with our team about multi-location deployment, security review, and enterprise support.</p>
            </div>
            <div className="lp-final-actions">
              <a href={MARKETING_DEMO_HREF} className="lp-btn lp-btn--light lp-btn--lg">
                {MARKETING_CTA_REQUEST_DEMO}
                <SiteIcon name="arrow" size={18} />
              </a>
              <Link to="/security" className="lp-btn lp-btn--ghost lp-btn--lg">
                View security
              </Link>
            </div>
          </div>
        </section>
      </main>
    </WebsiteChrome>
  );
}
