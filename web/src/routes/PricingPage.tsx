import { Link } from "react-router-dom";
import { PlanMarketingCards } from "../components/PlanMarketingCards";
import { SiteIcon } from "../components/SiteHeader";
import { WebsiteChrome } from "../components/WebsiteChrome";
import { MARKETING_CTA_START_FREE } from "../lib/marketing-constants";
import { usePlans } from "../lib/plans-api";

export function PricingPage() {
  const { pro, operations } = usePlans();
  return (
    <WebsiteChrome
      activeNav="pricing"
      hero={
        <>
          <p className="lp-badge">Pricing</p>
          <h1>
            Choose the plan that <span className="lp-gradient-text">fits your team.</span>
          </h1>
          <p>
            Simple pricing. No hidden fees. Cancel anytime. Every workspace has its own subscription — start free, then
            upgrade when you are ready to execute.
          </p>
        </>
      }
    >
      <main data-testid="pricing-page">
        <PlanMarketingCards />

        <section className="lp-section" aria-labelledby="pricing-notes-heading">
          <div className="lp-notes">
            <h2 id="pricing-notes-heading">How billing works</h2>
            <ul>
              <li>
                <strong>Free</strong> includes activity, chat, and team members for every workspace.
              </li>
              <li>
                <strong>{pro.name}</strong> unlocks tasks, Seneca AI coaching, check-ins, development plans, calendar,
                Outlook sync, metrics, celebrations, and core workspace features on web and mobile — {pro.priceLabel}{" "}
                {pro.periodLabel}.
              </li>
              <li>
                <strong>{operations.name}</strong> includes everything in {pro.name} plus Alenio Go (checklists,
                temperature checks, briefings, walks, and execution tools) — {operations.priceLabel}{" "}
                {operations.periodLabel}.
              </li>
              <li>Subscriptions are billed per workspace. Only the workspace owner can upgrade or manage billing.</li>
            </ul>
          </div>
        </section>

        <section className="lp-section lp-final">
          <div className="lp-final-card">
            <div>
              <h2>Ready to run better every day?</h2>
              <p>Create your account, invite your team, and upgrade when you need execution tools.</p>
            </div>
            <div className="lp-final-actions">
              <Link to="/sign-up" className="lp-btn lp-btn--light lp-btn--lg">
                {MARKETING_CTA_START_FREE}
                <SiteIcon name="arrow" size={18} />
              </Link>
              <Link to="/login" className="lp-btn lp-btn--ghost lp-btn--lg">
                Log In
              </Link>
            </div>
          </div>
        </section>
      </main>
    </WebsiteChrome>
  );
}
