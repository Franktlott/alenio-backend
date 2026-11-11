import { Link } from "react-router-dom";
import { usePlans } from "../lib/plans-api";
import { SiteIcon } from "./SiteHeader";

export function PlanMarketingCards() {
  const { pro, operations } = usePlans();
  const opsLabel = operations.features[0]?.startsWith("Everything in")
    ? "What's included"
    : `Everything in ${pro.name}, plus`;
  return (
    <div className="lp-plans" data-testid="pricing-plan-grid">
      <section className="lp-plan lp-plan--popular" aria-labelledby="pricing-pro-heading">
        <div className="lp-plan-top">
          <h2 id="pricing-pro-heading">{pro.name}</h2>
          {pro.comingSoon ? (
            <span className="lp-plan-pill lp-plan-pill--soon">Coming soon</span>
          ) : (
            <span className="lp-plan-pill">
              <SiteIcon name="star" size={12} />
              Most popular
            </span>
          )}
        </div>
        <p className="lp-plan-tagline">{pro.bestFor}</p>
        <div className="lp-plan-price">
          <strong>{pro.priceLabel}</strong>
          <span>{pro.periodLabel}</span>
        </div>
        <p className="lp-plan-label">Core workspace features</p>
        <ul className="lp-checks">
          {pro.features.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        {pro.comingSoon ? (
          <span className="lp-btn lp-btn--primary lp-btn--lg lp-btn--block lp-plan-cta is-disabled" aria-disabled="true">
            Coming soon
          </span>
        ) : (
          <Link to="/sign-up" className="lp-btn lp-btn--primary lp-btn--lg lp-btn--block lp-plan-cta">
            Start 14-day trial
            <SiteIcon name="arrow" size={18} />
          </Link>
        )}
        <p className="lp-plan-note">
          {pro.comingSoon ? "Not available for signup yet" : `No card required · Choose ${pro.name} anytime`}
        </p>
      </section>

      <section
        className={`lp-plan${operations.comingSoon ? " lp-plan--soon" : ""}`}
        aria-labelledby="pricing-operations-heading"
      >
        <div className="lp-plan-top">
          <h2 id="pricing-operations-heading">{operations.name}</h2>
          {operations.comingSoon ? <span className="lp-plan-pill lp-plan-pill--soon">Coming soon</span> : null}
        </div>
        <p className="lp-plan-tagline">{operations.bestFor}</p>
        <div className="lp-plan-price">
          <strong>{operations.priceLabel}</strong>
          <span>{operations.periodLabel}</span>
        </div>
        <p className="lp-plan-label">{opsLabel}</p>
        <ul className="lp-checks">
          {operations.features.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        {operations.comingSoon ? (
          <span className="lp-btn lp-btn--outline lp-btn--lg lp-btn--block lp-plan-cta is-disabled" aria-disabled="true">
            Coming soon
          </span>
        ) : (
          <Link to="/sign-up" className="lp-btn lp-btn--outline lp-btn--lg lp-btn--block lp-plan-cta">
            Start 14-day {operations.name} trial
            <SiteIcon name="arrow" size={18} />
          </Link>
        )}
        <p className="lp-plan-note">
          {operations.comingSoon ? "Not available for signup yet" : "No card required · Includes Alenio Go"}
        </p>
      </section>
    </div>
  );
}
