import { Link } from "react-router-dom";
import {
  OPERATIONS_BEST_FOR,
  OPERATIONS_FEATURES,
  OPERATIONS_PRICE_AMOUNT,
  OPERATIONS_PRICE_PERIOD,
  PRO_BEST_FOR,
  PRO_FEATURES,
  PRO_PRICE_AMOUNT,
  PRO_PRICE_PERIOD,
} from "../lib/plan-catalog";

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
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
    <div className={`site-pricing-grid site-pricing-grid-2 ${className}`.trim()} data-testid="pricing-plan-grid">
      <section className="site-pricing-card site-pricing-card-team" aria-labelledby="pricing-pro-heading">
        <div className="site-pricing-badge-popular">
          <IconStar />
          <span>Most popular</span>
        </div>
        <h2 id="pricing-pro-heading" className="site-pricing-card-title">
          Pro
        </h2>
        <p className="site-pricing-card-tagline">{PRO_BEST_FOR}</p>
        <div className="site-pricing-price">
          <span className="site-pricing-price-amount site-pricing-price-amount-team">{PRO_PRICE_AMOUNT}</span>
          <span className="site-pricing-price-period">{PRO_PRICE_PERIOD}</span>
        </div>
        <p className="site-pricing-section-label">Core workspace features</p>
        <ul className="site-pricing-feature-list">
          {PRO_FEATURES.map((label) => (
            <li key={label}>
              <span className="site-pricing-icon site-pricing-icon-team" aria-hidden>
                <IconCheck />
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <Link to="/sign-up" className="site-v2-btn site-v2-btn-primary site-pricing-cta">
          Start 14-day trial
        </Link>
        <p className="site-pricing-cta-note">No card required · Choose Pro anytime</p>
      </section>

      <section
        className="site-pricing-card site-pricing-card-enterprise"
        aria-labelledby="pricing-operations-heading"
      >
        <div className="site-pricing-card-title-row">
          <h2 id="pricing-operations-heading" className="site-pricing-card-title">
            Operations
          </h2>
        </div>
        <p className="site-pricing-card-tagline">{OPERATIONS_BEST_FOR}</p>
        <div className="site-pricing-price">
          <span className="site-pricing-price-amount site-pricing-price-amount-enterprise">{OPERATIONS_PRICE_AMOUNT}</span>
          <span className="site-pricing-price-period">{OPERATIONS_PRICE_PERIOD}</span>
        </div>
        <p className="site-pricing-section-label">Everything in Pro, plus</p>
        <ul className="site-pricing-feature-list">
          {OPERATIONS_FEATURES.map((label) => (
            <li key={label}>
              <span className="site-pricing-icon site-pricing-icon-enterprise" aria-hidden>
                <IconCheck />
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        <Link to="/sign-up" className="site-v2-btn site-v2-btn-primary site-pricing-cta">
          Start 14-day Operations trial
        </Link>
        <p className="site-pricing-cta-note">No card required · Includes Alenio Go</p>
      </section>
    </div>
  );
}
