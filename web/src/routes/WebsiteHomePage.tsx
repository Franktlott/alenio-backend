import { Link } from "react-router-dom";
import { MarketingFooter } from "../components/MarketingFooter";
import { SenecaIcon } from "../components/seneca/SenecaShared";
import {
  MARKETING_CTA_REQUEST_DEMO,
  MARKETING_CTA_START_FREE,
  MARKETING_DEMO_HREF,
  MARKETING_EXAMPLE_BADGE,
  MARKETING_EXAMPLE_METRICS,
  MARKETING_COACHING_PILLARS,
  MARKETING_FINAL_CTA_HEADLINE,
  MARKETING_FINAL_CTA_SUBCOPY,
  MARKETING_HERO_HEADLINE,
  MARKETING_HERO_HEADLINE_ACCENT,
  MARKETING_HERO_SUBCOPY,
  MARKETING_SENECA_SECTION,
} from "../lib/marketing-constants";

const pillars = [
  {
    title: "Know what's happening instantly",
    icon: "chat",
    points: [
      "Team channels and direct messages",
      "Polls for quick shift decisions",
      "Video calls right from chat",
    ],
  },
  {
    title: "Keep tasks from slipping",
    icon: "tasks",
    points: [
      "Assign owners and due dates",
      "Subtasks, files, and photos",
      "Templates for recurring work",
    ],
  },
  {
    title: "Run every location consistently",
    icon: "locations",
    points: [
      "Calendar for trainings and visits",
      "Personal Outlook calendar sync",
      "Same playbook at every site",
    ],
  },
];

const industries = [
  {
    title: "Restaurants & Fast Food",
    tone: "restaurant",
    image: "/industry-restaurants-fast-food.png",
    points: [
      "Shift handoffs in chat",
      "Opening and closing checklists",
      "Manager visits on the calendar",
    ],
  },
  {
    title: "Retail Stores",
    tone: "retail",
    image: "/industry-retail-stores.png",
    points: [
      "Floor standards as tasks",
      "DMs for quick questions",
      "Multi-store visibility",
    ],
  },
  {
    title: "Convenience & C-Stores",
    tone: "cstore",
    image: "/industry-convenience-c-stores.png",
    points: [
      "Cooler restock tasks with proof",
      "Polls for shift coverage",
      "See work across locations",
    ],
  },
  {
    title: "Multifamily & Communities",
    tone: "multifamily",
    image: "/industry-multifamily-communities.png",
    points: [
      "Staff channels and DMs",
      "Work orders with photos",
      "Vendor and tour scheduling",
    ],
  },
];

const useCases = [
  {
    title: "During a rush",
    desc: "Send quick updates, get help, keep the floor moving.",
    tone: "rush",
    image: "/usecase-during-a-rush.png",
  },
  {
    title: "Opening a new location",
    desc: "Use templates to roll out standards and track readiness before day one.",
    tone: "open",
    image: "/usecase-opening-new-location.png",
  },
  {
    title: "For managers",
    desc: "Seneca AI, 1:1 check-ins, and development plans — less follow-up, more coaching.",
    tone: "manager",
    image: "/usecase-for-managers.png",
  },
  {
    title: "For field leaders",
    desc: "Stay aligned with visibility into every store and team.",
    tone: "field",
    image: "/usecase-field-leaders.png",
  },
];

type CompareValue = boolean | string;

const compareRows: {
  feature: string;
  teams: CompareValue;
  slack: CompareValue;
  groupme: CompareValue;
  alenio: CompareValue;
}[] = [
  {
    feature: "Real-time team messaging",
    teams: true,
    slack: true,
    groupme: true,
    alenio: true,
  },
  {
    feature: "Tasks with owners, due dates & proof",
    teams: "Planner (separate)",
    slack: "Add-ons",
    groupme: false,
    alenio: true,
  },
  {
    feature: "Team calendar in the same app",
    teams: true,
    slack: "Integrations",
    groupme: false,
    alenio: true,
  },
  {
    feature: "Personal Outlook calendar sync",
    teams: "Outlook app only",
    slack: "Add-on integrations",
    groupme: false,
    alenio: true,
  },
  {
    feature: "Polls in chat",
    teams: true,
    slack: "Apps",
    groupme: true,
    alenio: true,
  },
  {
    feature: "Video calls from chat",
    teams: true,
    slack: "Huddles",
    groupme: "Limited",
    alenio: true,
  },
  {
    feature: "Seneca AI manager coaching",
    teams: false,
    slack: false,
    groupme: false,
    alenio: true,
  },
  {
    feature: "1:1 check-ins with templates & prep",
    teams: "Separate tools",
    slack: false,
    groupme: false,
    alenio: true,
  },
  {
    feature: "Development plans & growth tracking",
    teams: "Add-ons",
    slack: false,
    groupme: false,
    alenio: true,
  },
  {
    feature: "Frontline checklists (Alenio Go)",
    teams: false,
    slack: false,
    groupme: false,
    alenio: true,
  },
  {
    feature: "Built for frontline shift work",
    teams: "Office-first",
    slack: "Office-first",
    groupme: "Social groups",
    alenio: true,
  },
  {
    feature: "Chat, tasks & calendar together",
    teams: "Multiple apps",
    slack: "Stack of tools",
    groupme: "Chat only",
    alenio: true,
  },
];

function CompareCell({ value }: { value: CompareValue }) {
  if (value === true) {
    return (
      <span className="site-v2-check" aria-label="Included">
        ✓
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="site-v2-compare-miss" aria-label="Not included">
        —
      </span>
    );
  }
  return <span className="site-v2-compare-note">{value}</span>;
}

const activityItems = [
  { name: "Jessica M.", action: "completed Restock Cooler", time: "12m ago", avatar: "JM" },
  { name: "Marcus T.", action: "posted in #morning-shift", time: "28m ago", avatar: "MT" },
  { name: "Manager", action: "assigned Opening checklist", time: "1h ago", avatar: "MG" },
  { name: "Aisha K.", action: "uploaded photo on task", time: "2h ago", avatar: "AK" },
];

function PillarIcon({ type }: { type: string }) {
  if (type === "seneca") {
    return <SenecaIcon size={28} className="site-v2-pillar-seneca-icon" />;
  }
  if (type === "checkin") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (type === "growth") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M3 3v18h18" strokeLinecap="round" />
        <path d="M7 14l4-4 4 4 5-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "tasks") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  if (type === "locations") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function WebsiteHomePage() {
  return (
    <div className="site-v2">
      <section className="site-v2-hero">
        <header className="site-v2-header site-v2-header-hero">
          <Link to="/" className="site-v2-brand" aria-label="Alenio home">
            <img src="/alenio-logo-white.png" alt="Alenio" className="site-v2-logo-full" width={168} height={40} />
          </Link>
          <nav className="site-v2-nav" aria-label="Primary">
            <a href="#seneca" className="site-v2-nav-seneca">
              <SenecaIcon size={16} className="site-v2-nav-seneca-icon" />
              Seneca AI
            </a>
            <a href="#how-alenio-works">How it works</a>
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

        <div className="site-v2-hero-main">
          <div className="site-v2-hero-copy">
            <h1>
              {MARKETING_HERO_HEADLINE} <span className="site-v2-hero-headline-accent">{MARKETING_HERO_HEADLINE_ACCENT}</span>
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
          </div>

          <div className="site-v2-hero-visual" aria-hidden>
            <div className="site-v2-phone-mock">
              <div className="site-v2-phone-screen">
                <div className="site-v2-phone-header"># morning-shift</div>
                <div className="site-v2-phone-msg site-v2-phone-msg-them">
                  <span className="site-v2-phone-avatar">JM</span>
                  Cooler restock done — photo attached
                </div>
                <div className="site-v2-phone-msg site-v2-phone-msg-me">Opening checklist at 85%</div>
                <div className="site-v2-phone-seneca">
                  <span className="site-v2-phone-seneca-head">
                    <SenecaIcon size={18} className="site-v2-phone-seneca-icon" />
                    <span className="site-v2-phone-seneca-label">Seneca</span>
                  </span>
                  3 overdue tasks · check-in due for Vera
                </div>
                <div className="site-v2-phone-tasks">
                  <div className="site-v2-phone-tasks-title">Today&apos;s tasks</div>
                  <div className="site-v2-phone-task done">✓ Restock cooler</div>
                  <div className="site-v2-phone-task">○ Floor standards walk</div>
                </div>
              </div>
            </div>
            <div className="site-v2-dashboard-mock">
              <div className="site-v2-dash-bar" />
              <div className="site-v2-hero-seneca-fab" aria-hidden>
                <span className="site-v2-hero-seneca-fab-ring" />
                <SenecaIcon size={44} className="site-v2-hero-seneca-fab-icon" />
              </div>
              <div className="site-v2-dash-grid">
                <div className="site-v2-dash-card">
                  <span className="site-v2-dash-label">Shift completion</span>
                  <span className="site-v2-dash-value site-v2-dash-value-example">—</span>
                </div>
                <div className="site-v2-dash-card">
                  <span className="site-v2-dash-label">Tasks today</span>
                  <span className="site-v2-dash-value site-v2-dash-value-example">—</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="seneca" className="site-v2-section site-v2-seneca-marketing" aria-labelledby="seneca-marketing-title">
        <div className="site-v2-seneca-marketing-inner">
          <div className="site-v2-seneca-marketing-copy">
            <div className="site-v2-seneca-marketing-title-row">
              <SenecaIcon size={52} className="site-v2-seneca-marketing-icon" />
              <div>
                <p className="site-v2-seneca-marketing-eyebrow">{MARKETING_SENECA_SECTION.eyebrow}</p>
                <h2 id="seneca-marketing-title">{MARKETING_SENECA_SECTION.title}</h2>
              </div>
            </div>
            <p className="site-v2-seneca-marketing-sub">{MARKETING_SENECA_SECTION.subcopy}</p>
            <ul className="site-v2-seneca-prompt-list">
              {MARKETING_SENECA_SECTION.prompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          </div>
          <div className="site-v2-seneca-marketing-panel" aria-hidden>
            <div className="site-v2-seneca-marketing-panel-head">
              <SenecaIcon size={32} className="site-v2-seneca-marketing-panel-icon" />
              <div>
                <span className="site-v2-seneca-marketing-panel-brand">Seneca</span>
                <span className="site-v2-seneca-marketing-panel-kicker">AI Coaching Assistant</span>
              </div>
            </div>
            <p className="site-v2-seneca-marketing-insight">{MARKETING_SENECA_SECTION.insightExample}</p>
            <div className="site-v2-seneca-marketing-actions">
              <span>Create follow-up task</span>
              <span>Schedule check-in</span>
              <span>Create recognition post</span>
              <span>Build checklist</span>
            </div>
          </div>
        </div>
        <div className="site-v2-seneca-cap-grid">
          {MARKETING_SENECA_SECTION.capabilities.map((cap, index) => (
            <article key={cap.title} className="site-v2-seneca-cap-card">
              {index === 0 ? (
                <div className="site-v2-seneca-cap-icon-wrap" aria-hidden>
                  <SenecaIcon size={24} className="site-v2-seneca-cap-icon" />
                </div>
              ) : null}
              <h3>{cap.title}</h3>
              <p>{cap.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="coaching" className="site-v2-section site-v2-pillars site-v2-coaching-pillars">
        <div className="site-v2-center-head">
          <h2>Coach and develop your team</h2>
          <p>Check-ins, development plans, and Seneca AI — built into the same workspace as chat and tasks.</p>
        </div>
        <div className="site-v2-pillar-grid site-v2-pillar-grid-coaching">
          {MARKETING_COACHING_PILLARS.map((p) => (
            <article key={p.title} className="site-v2-pillar-card">
              <div className="site-v2-pillar-icon site-v2-pillar-icon-coaching">
                <PillarIcon type={p.icon} />
              </div>
              <h3>{p.title}</h3>
              <ul>
                {p.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="site-v2-section site-v2-pillars">
        <div className="site-v2-pillar-grid">
          {pillars.map((p) => (
            <article key={p.title} className="site-v2-pillar-card">
              <div className="site-v2-pillar-icon">
                <PillarIcon type={p.icon} />
              </div>
              <h3>{p.title}</h3>
              <ul>
                {p.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="industries" className="site-v2-section">
        <div className="site-v2-center-head">
          <h2>Built for your industry</h2>
        </div>
        <div className="site-v2-industry-grid site-v2-industry-grid-v2">
          {industries.map((industry) => (
            <article
              key={industry.title}
              className={`site-v2-industry-card-v2 site-v2-industry-${industry.tone}${industry.image ? " site-v2-industry-has-photo" : ""}`}
            >
              {industry.image ? (
                <img
                  src={industry.image}
                  alt=""
                  className="site-v2-industry-photo site-v2-industry-photo-img"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="site-v2-industry-photo" aria-hidden />
              )}
              <div className="site-v2-industry-body">
                <h3>{industry.title}</h3>
                <ul>
                  {industry.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <a href="#contact" className="site-v2-industry-link">
                  See how it works →
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="how-alenio-works" className="site-v2-section site-v2-usecases">
        <div className="site-v2-center-head">
          <h2>How Alenio Works</h2>
        </div>
        <div className="site-v2-usecase-grid">
          {useCases.map((uc) => (
            <article
              key={uc.title}
              className={`site-v2-usecase-card site-v2-usecase-${uc.tone}${uc.image ? " site-v2-usecase-has-image" : ""}`}
            >
              {uc.image ? (
                <img
                  src={uc.image}
                  alt=""
                  className="site-v2-usecase-art site-v2-usecase-art-img"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="site-v2-usecase-art" aria-hidden />
              )}
              <h3>{uc.title}</h3>
              <p>{uc.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-v2-section site-v2-compare-wrap">
        <div className="site-v2-center-head">
          <h2>How Alenio compares</h2>
          <p>
            Teams, Slack, and GroupMe are strong at messaging. Alenio adds shift-ready tasks, Seneca AI coaching,
            check-ins, development plans, and visibility in one app built for the floor.
          </p>
        </div>
        <div className="site-v2-compare-scroll">
          <table className="site-v2-compare-table">
            <thead>
              <tr>
                <th scope="col" className="site-v2-compare-col-feature">
                  Capability
                </th>
                <th scope="col" className="site-v2-compare-col-competitor">
                  Microsoft Teams
                </th>
                <th scope="col" className="site-v2-compare-col-competitor">
                  Slack
                </th>
                <th scope="col" className="site-v2-compare-col-competitor">
                  GroupMe
                </th>
                <th scope="col" className="site-v2-compare-col-alenio">
                  Alenio
                </th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr key={row.feature}>
                  <th scope="row">{row.feature}</th>
                  <td className="site-v2-compare-col-competitor">
                    <CompareCell value={row.teams} />
                  </td>
                  <td className="site-v2-compare-col-competitor">
                    <CompareCell value={row.slack} />
                  </td>
                  <td className="site-v2-compare-col-competitor">
                    <CompareCell value={row.groupme} />
                  </td>
                  <td className="site-v2-compare-col-alenio">
                    <CompareCell value={row.alenio} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="resources" className="site-v2-section site-v2-insights">
        <div className="site-v2-insights-grid">
          <article className="site-v2-activity-card">
            <div className="site-v2-example-head">
              <h3>Live activity across your team</h3>
              <span className="site-v2-example-badge">{MARKETING_EXAMPLE_BADGE}</span>
            </div>
            <ul className="site-v2-activity-list">
              {activityItems.map((item) => (
                <li key={`${item.name}-${item.time}`}>
                  <span className="site-v2-activity-avatar">{item.avatar}</span>
                  <div className="site-v2-activity-text">
                    <strong>{item.name}</strong> {item.action}
                    <span className="site-v2-activity-time">{item.time}</span>
                  </div>
                  <span className="site-v2-activity-dot" aria-hidden />
                </li>
              ))}
            </ul>
          </article>
          <article className="site-v2-metrics-card">
            <div className="site-v2-example-head">
              <h3>See what drives results</h3>
              <span className="site-v2-example-badge">{MARKETING_EXAMPLE_BADGE}</span>
            </div>
            {MARKETING_EXAMPLE_METRICS.map((metric) => (
              <div key={metric.label} className="site-v2-metric">
                <div className="site-v2-metric-top">
                  <span className="site-v2-metric-label">{metric.label}</span>
                </div>
                <span className="site-v2-metric-value site-v2-metric-value-example">{metric.value}</span>
              </div>
            ))}
          </article>
        </div>
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
