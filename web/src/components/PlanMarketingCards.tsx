import { Link } from "react-router-dom";
import {
  FREE_INCLUDED,
  FREE_LOCKED,
  TEAM_FEATURES,
  TEAM_PRICE_AMOUNT,
  TEAM_PRICE_PERIOD,
} from "../lib/plan-catalog";

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="currentColor" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

type Props = {
  className?: string;
};

export function PlanMarketingCards({ className = "" }: Props) {
  return (
    <div className={`site-pricing-grid ${className}`.trim()} data-testid="pricing-plan-grid">
      <section className="site-pricing-card site-pricing-card-free" aria-labelledby="pricing-free-heading">
        <div className="site-pricing-card-head">
          <div>
            <h2 id="pricing-free-heading" className="site-pricing-card-title">
              Free
            </h2>
            <p className="site-pricing-card-tagline">Perfect for teams getting started</p>
          </div>
        </div>
        <div className="site-pricing-price">
          <span className="site-pricing-price-amount site-pricing-price-amount-muted">$0</span>
          <span className="site-pricing-price-period">forever</span>
        </div>
        <p className="site-pricing-section-label">Included</p>
        <ul className="site-pricing-feature-list">
          {FREE_INCLUDED.map((label) => (
            <li key={label}>
              <span className="site-pricing-icon site-pricing-icon-included" aria-hidden>
                <IconCheck />
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <p className="site-pricing-section-label">Unlock with Team</p>
        <ul className="site-pricing-feature-list">
          {FREE_LOCKED.map((label) => (
            <li key={label} className="site-pricing-feature-locked">
              <span className="site-pricing-icon site-pricing-icon-locked" aria-hidden>
                <IconLock />
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <Link to="/sign-up" className="site-v2-btn site-pricing-cta site-pricing-cta-outline">
          Get started free
        </Link>
      </section>

      <section className="site-pricing-card site-pricing-card-team" aria-labelledby="pricing-team-heading">
        <div className="site-pricing-badge-popular">
          <IconStar />
          <span>Most popular</span>
        </div>
        <h2 id="pricing-team-heading" className="site-pricing-card-title">
          Team
        </h2>
        <p className="site-pricing-card-tagline">For fast-moving teams that need execution</p>
        <div className="site-pricing-price">
          <span className="site-pricing-price-amount site-pricing-price-amount-team">{TEAM_PRICE_AMOUNT}</span>
          <span className="site-pricing-price-period">{TEAM_PRICE_PERIOD}</span>
        </div>
        <p className="site-pricing-section-label">Everything in Free, plus</p>
        <ul className="site-pricing-feature-list">
          {TEAM_FEATURES.map((label) => (
            <li key={label}>
              <span className="site-pricing-icon site-pricing-icon-team" aria-hidden>
                <IconCheck />
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <Link to="/sign-up" className="site-v2-btn site-v2-btn-primary site-pricing-cta">
          Start with Team
        </Link>
        <p className="site-pricing-cta-note">Cancel anytime · Secure checkout on web</p>
      </section>
    </div>
  );
}
