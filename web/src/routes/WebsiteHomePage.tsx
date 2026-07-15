import { Link } from "react-router-dom";
import { MarketingFooter } from "../components/MarketingFooter";
import { SenecaIcon } from "../components/seneca/SenecaShared";
import {
  MARKETING_CTA_REQUEST_DEMO,
  MARKETING_CTA_START_FREE,
  MARKETING_DEMO_HREF,
  MARKETING_ENTERPRISE_TRUST,
  MARKETING_FINAL_CTA_HEADLINE,
  MARKETING_FINAL_CTA_SUBCOPY,
  MARKETING_HERO_BADGE,
  MARKETING_HERO_HEADLINE,
  MARKETING_HERO_HEADLINE_ACCENT,
  MARKETING_HERO_SUBCOPY,
  MARKETING_HERO_TRUST,
  MARKETING_PLATFORM_PILLARS,
  MARKETING_SENECA_SECTION,
  MARKETING_TRUSTED_INDUSTRIES,
} from "../lib/marketing-constants";

const heroStats = [
  { label: "Tasks due today", value: "3", tone: "default" },
  { label: "Overdue", value: "1", tone: "warn" },
  { label: "Stores need attention", value: "2", tone: "default" },
  { label: "Task completion", value: "95%", tone: "good" },
] as const;

const heroActivity = [
  { name: "Jessica M.", action: "completed Restock Cooler", time: "2m ago", avatar: "JM" },
  { name: "Marcus T.", action: "posted in #morning-shift", time: "15m ago", avatar: "MT" },
  { name: "Aisha K.", action: "finished Opening Walk", time: "28m ago", avatar: "AK" },
] as const;

function PillarIcon({ tone }: { tone: string }) {
  if (tone === "execute") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" />
      </svg>
    );
  }
  if (tone === "elevate") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 19V5" strokeLinecap="round" />
        <path d="M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrustIcon({ title }: { title: string }) {
  if (title.startsWith("SSO")) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (title.startsWith("Role")) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  if (title.startsWith("Data")) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IndustryIcon({ name }: { name: string }) {
  if (name === "Convenience") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M3 9l1-4h16l1 4" />
        <path d="M4 9v10h16V9" />
        <path d="M9 19v-6h6v6" />
      </svg>
    );
  }
  if (name === "Retail") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M6 2l2 7h8l2-7" />
        <path d="M4 9h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" />
      </svg>
    );
  }
  if (name === "Restaurants") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M3 2v7c0 1.1.9 2 2 2h1v11" />
        <path d="M7 2v20" />
        <path d="M21 15V2a5 5 0 0 0-5 5v6h5z" />
        <path d="M16 15v7" />
      </svg>
    );
  }
  if (name === "Healthcare") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M12 2v20M2 12h20" />
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M3 21h18" />
      <path d="M5 21V8l7-5 7 5v13" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

export function WebsiteHomePage() {
  return (
    <div className="site-v2 site-v2-home">
      <section className="site-v2-hero site-v2-hero--viewport" aria-label="Alenio home">
        <div className="site-v2-hero-atmosphere" aria-hidden />
        <header className="site-v2-header site-v2-header-hero">
          <Link to="/" className="site-v2-brand" aria-label="Alenio home">
            <img src="/alenio-logo-white.png" alt="Alenio" className="site-v2-logo-full" width={168} height={40} />
          </Link>
          <nav className="site-v2-nav" aria-label="Primary">
            <a href="#pillars">Product</a>
            <a href="#seneca" className="site-v2-nav-seneca">
              <SenecaIcon size={16} className="site-v2-nav-seneca-icon" />
              Seneca AI
            </a>
            <a href="#pillars">Solutions</a>
            <Link to="/pricing">Pricing</Link>
            <Link to="/enterprise">Enterprise</Link>
            <Link to="/security">Security</Link>
          </nav>
          <div className="site-v2-head-actions">
            <Link to="/login" className="site-v2-login">
              Log in
            </Link>
            <Link to="/sign-up" className="site-v2-head-cta">
              {MARKETING_CTA_START_FREE}
            </Link>
          </div>
        </header>

        <div className="site-v2-hero-main site-v2-hero-main--home">
          <div className="site-v2-hero-copy">
            <p className="site-v2-hero-badge">{MARKETING_HERO_BADGE}</p>
            <h1>
              {MARKETING_HERO_HEADLINE}{" "}
              <span className="site-v2-hero-headline-accent">{MARKETING_HERO_HEADLINE_ACCENT}</span>
            </h1>
            <p>{MARKETING_HERO_SUBCOPY}</p>
            <div className="site-v2-hero-cta">
              <Link to="/sign-up" className="site-v2-btn site-v2-btn-primary">
                {MARKETING_CTA_START_FREE}
              </Link>
              <a href={MARKETING_DEMO_HREF} className="site-v2-btn site-v2-btn-outline">
                {MARKETING_CTA_REQUEST_DEMO}
              </a>
            </div>
            <ul className="site-v2-hero-trust">
              {MARKETING_HERO_TRUST.map((item) => (
                <li key={item}>
                  <span className="site-v2-hero-trust-check" aria-hidden>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="site-v2-hero-stage" aria-hidden>
            <div className="site-v2-hero-desktop">
              <aside className="site-v2-hero-desktop-rail">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </aside>
              <div className="site-v2-hero-desktop-main">
                <div className="site-v2-hero-desktop-top">
                  <div>
                    <p className="site-v2-hero-desktop-greeting">Good morning, Jessica</p>
                    <p className="site-v2-hero-desktop-sub">Here&apos;s what&apos;s happening today.</p>
                  </div>
                  <div className="site-v2-hero-desktop-meta">
                    <span>All locations</span>
                    <span className="site-v2-hero-desktop-bell">3</span>
                  </div>
                </div>
                <div className="site-v2-hero-desktop-stats">
                  {heroStats.map((stat) => (
                    <div key={stat.label} className={`site-v2-hero-stat site-v2-hero-stat--${stat.tone}`}>
                      <strong>{stat.value}</strong>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>
                <div className="site-v2-hero-desktop-activity">
                  <div className="site-v2-hero-desktop-activity-head">
                    <span>Activity</span>
                    <span>View all</span>
                  </div>
                  <ul>
                    {heroActivity.map((item) => (
                      <li key={`${item.name}-${item.time}`}>
                        <span className="site-v2-hero-activity-avatar">{item.avatar}</span>
                        <div>
                          <strong>{item.name}</strong> {item.action}
                          <em>{item.time}</em>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="site-v2-hero-phone">
              <div className="site-v2-hero-phone-screen">
                <div className="site-v2-hero-phone-brand">
                  <img src="/alenio-mark-icon.svg" alt="" width={18} height={18} />
                  Alenio
                </div>
                <p className="site-v2-hero-phone-greeting">Good morning</p>
                <div className="site-v2-hero-phone-card">
                  <span>Upcoming</span>
                  <strong>Team Huddle</strong>
                  <em>Opening Walk</em>
                </div>
                <div className="site-v2-hero-phone-card">
                  <span>Activity</span>
                  <strong>Jessica completed Restock Cooler</strong>
                  <em>2m ago</em>
                </div>
                <div className="site-v2-hero-phone-nav">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </div>
        </div>

        <a href="#pillars" className="site-v2-hero-scroll" aria-label="Scroll to explore Alenio">
          <span>Scroll to explore</span>
        </a>
      </section>

      <section id="pillars" className="site-v2-section site-v2-platform-pillars">
        <div className="site-v2-center-head">
          <p className="site-v2-section-kicker">Three pillars. One platform.</p>
          <h2>Everything you need to lead with confidence.</h2>
        </div>
        <div className="site-v2-platform-grid">
          {MARKETING_PLATFORM_PILLARS.map((pillar) => (
            <article key={pillar.id} id={pillar.id} className={`site-v2-platform-card site-v2-platform-card--${pillar.tone}`}>
              <div className="site-v2-platform-icon">
                <PillarIcon tone={pillar.tone} />
              </div>
              <h3>{pillar.title}</h3>
              <p>{pillar.desc}</p>
              <a href={pillar.href} className="site-v2-platform-link">
                {pillar.cta} →
              </a>
            </article>
          ))}
        </div>
      </section>

      <section id="seneca" className="site-v2-section site-v2-seneca-home" aria-labelledby="seneca-home-title">
        <div className="site-v2-seneca-home-card">
          <div className="site-v2-seneca-home-copy">
            <SenecaIcon size={48} className="site-v2-seneca-home-mark" />
            <div className="site-v2-seneca-home-title-row">
              <h2 id="seneca-home-title">{MARKETING_SENECA_SECTION.title}</h2>
              <span className="site-v2-seneca-home-badge">{MARKETING_SENECA_SECTION.eyebrow}</span>
            </div>
            <p>{MARKETING_SENECA_SECTION.subcopy}</p>
            <a href="#seneca" className="site-v2-btn site-v2-btn-outline site-v2-seneca-home-cta">
              Learn about Seneca
            </a>
          </div>
          <div className="site-v2-seneca-home-panel" aria-hidden>
            <div className="site-v2-seneca-home-prompt">{MARKETING_SENECA_SECTION.promptExample}</div>
            <div className="site-v2-seneca-home-reply">
              <div className="site-v2-seneca-home-reply-head">
                <SenecaIcon size={22} />
                <span>Seneca</span>
              </div>
              <p>{MARKETING_SENECA_SECTION.insightExample}</p>
              <div className="site-v2-seneca-home-actions">
                {MARKETING_SENECA_SECTION.actions.map((action) => (
                  <span key={action}>{action}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="site-v2-section site-v2-enterprise-trust" aria-labelledby="enterprise-trust-title">
        <div className="site-v2-enterprise-trust-banner">
          <div className="site-v2-enterprise-trust-copy">
            <span className="site-v2-enterprise-trust-shield" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <div>
              <h2 id="enterprise-trust-title">Built for the enterprise.</h2>
              <p>Security, scale, and control for multi-location operators.</p>
            </div>
          </div>
          <Link to="/enterprise" className="site-v2-platform-link">
            Explore Enterprise →
          </Link>
        </div>
        <div className="site-v2-enterprise-trust-grid">
          {MARKETING_ENTERPRISE_TRUST.map((item) => (
            <article key={item.title} className="site-v2-enterprise-trust-item">
              <span className="site-v2-enterprise-trust-icon">
                <TrustIcon title={item.title} />
              </span>
              <strong>{item.title}</strong>
              <span>{item.desc}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="site-v2-section site-v2-trusted-industries" aria-label="Trusted industries">
        <p className="site-v2-section-kicker">Trusted by frontline teams in</p>
        <ul className="site-v2-trusted-list">
          {MARKETING_TRUSTED_INDUSTRIES.map((industry) => (
            <li key={industry}>
              <IndustryIcon name={industry} />
              <span>{industry}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="site-v2-final-cta">
        <div className="site-v2-final-cta-inner">
          <h2>{MARKETING_FINAL_CTA_HEADLINE}</h2>
          <p>{MARKETING_FINAL_CTA_SUBCOPY}</p>
          <div className="site-v2-hero-cta site-v2-final-cta-actions">
            <Link to="/sign-up" className="site-v2-btn site-v2-btn-primary site-v2-btn-lg">
              {MARKETING_CTA_START_FREE}
            </Link>
            <a href={MARKETING_DEMO_HREF} className="site-v2-btn site-v2-btn-outline site-v2-btn-lg">
              {MARKETING_CTA_REQUEST_DEMO}
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
