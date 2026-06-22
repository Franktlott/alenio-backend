import { Link } from "react-router-dom";
import { PlanMarketingCards } from "../components/PlanMarketingCards";
import { WebsiteChrome } from "../components/WebsiteChrome";

export function PricingPage() {
  return (
    <WebsiteChrome activeNav="pricing">
      <main className="site-pricing-main" data-testid="pricing-page">
        <header className="site-pricing-hero">
          <h1>Choose the plan that fits your team</h1>
          <p>
            Simple pricing. No hidden fees. Cancel anytime. Every workspace has its own subscription — start free, then
            upgrade when you are ready to execute.
          </p>
        </header>

        <PlanMarketingCards />

        <section className="site-pricing-notes" aria-labelledby="pricing-notes-heading">
          <h2 id="pricing-notes-heading">How billing works</h2>
          <ul>
            <li>
              <strong>Free</strong> includes activity, chat, and team members for every workspace.
            </li>
            <li>
              <strong>Team</strong> unlocks tasks, Seneca AI coaching, 1:1 check-ins, development plans, calendar, metrics,
              and the full workspace on web and mobile.
            </li>
            <li>
              <strong>Enterprise</strong> adds rollout support, SLAs, and security documentation for multi-location
              operators — contact us for custom pricing.
            </li>
            <li>Subscriptions are billed per workspace. Only the workspace owner can upgrade or manage billing.</li>
            <li>Team can also be purchased through the mobile app (App Store or Google Play) where available.</li>
          </ul>
        </section>

        <section className="site-pricing-bottom-cta">
          <h2>Ready to run better every day?</h2>
          <p>Create a free account, invite your team, and upgrade when you need execution tools.</p>
          <div className="site-v2-hero-cta site-pricing-bottom-actions">
            <Link to="/sign-up" className="site-v2-btn site-v2-btn-primary">
              Create free account
            </Link>
            <Link to="/login" className="site-v2-btn site-v2-btn-outline site-pricing-btn-on-light">
              Log in
            </Link>
          </div>
        </section>
      </main>
    </WebsiteChrome>
  );
}
