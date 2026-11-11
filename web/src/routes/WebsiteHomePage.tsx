import { Link } from "react-router-dom";
import { MarketingFooter } from "../components/MarketingFooter";
import { SiteHeader, SiteIcon, type SiteIconName } from "../components/SiteHeader";
import { MARKETING_CTA_START_FREE } from "../lib/marketing-constants";
import "../components/site-chrome.css";
import "./website-home.css";

const HERO_TRUST = ["Free to join the network", "14-day free workspace trial", "No credit card required"];

const NETWORK_POINTS = [
  "Build your professional network",
  "Share wins, ideas, and best practices",
  "Discover leaders and new opportunities",
];

const WORKSPACE_POINTS = ["Assign and track tasks", "Manage schedules and events", "Develop, recognize, and grow your team"];

const FEATURES: Array<{ icon: SiteIconName; title: string; sub?: string }> = [
  { icon: "chat", title: "Chat & Messaging" },
  { icon: "check", title: "Tasks & Execution" },
  { icon: "calendar", title: "Scheduling & Events" },
  { icon: "people", title: "Team Development" },
  { icon: "star", title: "Recognition & Updates" },
  { icon: "spark", title: "Seneca AI", sub: "Your operations assistant" },
];

function StatusBar({ dark }: { dark?: boolean }) {
  return (
    <div className={`lp-phone-status${dark ? " is-dark" : ""}`}>
      <span>9:41</span>
      <span className="lp-phone-status-icons">
        <i />
        <i />
        <b />
      </span>
    </div>
  );
}

function TabBar({ active }: { active: string }) {
  const tabs: Array<{ label: string; icon: SiteIconName }> = [
    { label: "Home", icon: "layers" },
    { label: "Chat", icon: "chat" },
    { label: "Workspace", icon: "check" },
    { label: "Network", icon: "people" },
    { label: "Profile", icon: "star" },
  ];
  return (
    <div className="lp-phone-tabs">
      {tabs.map((tab) => (
        <span key={tab.label} className={tab.label === active ? "is-on" : undefined}>
          <SiteIcon name={tab.icon} size={14} />
          {tab.label}
        </span>
      ))}
    </div>
  );
}

function NetworkPhone() {
  return (
    <div className="lp-phone lp-phone--network">
      <div className="lp-phone-screen">
        <StatusBar />
        <div className="lp-phone-head">
          <span className="lp-avatar lp-avatar--sm" style={{ background: "#c4b5fd" }}>
            FL
          </span>
          <strong>Network</strong>
          <span className="lp-phone-icon-btn">
            <SiteIcon name="chat" size={13} />
          </span>
        </div>
        <div className="lp-seg">
          <span className="is-on">Feed</span>
          <span>Explore</span>
          <span>My Network</span>
        </div>
        <article className="lp-post">
          <header>
            <span className="lp-avatar" style={{ background: "#f9a8d4" }}>
              VM
            </span>
            <div>
              <strong>
                Vera Mitchell <em>· 2h</em>
              </strong>
              <small>Retail Operations Leader</small>
            </div>
            <span className="lp-dots">•••</span>
          </header>
          <p>Great team win today! ✨ Zero criticals on our food safety walk!</p>
          <img src="/lp-team-feed.jpg" alt="" width={640} height={480} loading="eager" />
          <footer>
            <span className="lp-heart">♥ 46</span>
            <span>
              <SiteIcon name="chat" size={12} /> 12
            </span>
          </footer>
        </article>
        <article className="lp-post lp-post--peek">
          <header>
            <span className="lp-avatar" style={{ background: "#93c5fd" }}>
              AG
            </span>
            <div>
              <strong>
                Antonio Greene <em>· 4h</em>
              </strong>
              <small>Multi-Unit Leader</small>
            </div>
          </header>
          <p>Just wrapped our leadership roundtables. So many great ideas from the team!</p>
        </article>
        <span className="lp-fab">+</span>
        <TabBar active="Home" />
      </div>
    </div>
  );
}

function WorkspacePhone() {
  const today = [
    { label: "Opening Walk", done: true },
    { label: "Deli Setup", done: false },
    { label: "Beverage Check", done: false },
    { label: "Team Briefing", done: false },
  ];
  const tiles: Array<{ icon: SiteIconName; title: string; sub: string }> = [
    { icon: "check", title: "Tasks", sub: "28 assigned" },
    { icon: "calendar", title: "Calendar", sub: "4 events" },
    { icon: "people", title: "Development", sub: "8 check-ins" },
    { icon: "spark", title: "Updates", sub: "Team activity" },
  ];
  return (
    <div className="lp-phone lp-phone--workspace">
      <div className="lp-phone-screen lp-phone-screen--dark">
        <StatusBar dark />
        <div className="lp-ws-head">
          <strong>Workspace</strong>
          <span className="lp-avatar lp-avatar--sm" style={{ background: "#fcd34d" }}>
            JM
          </span>
        </div>
        <div className="lp-ws-body">
          <div className="lp-ws-store">
            <span className="lp-ws-store-badge">A</span>
            <strong>Store #5101</strong>
            <SiteIcon name="chevron" size={12} />
          </div>
          <div className="lp-ws-tiles">
            {tiles.map((tile) => (
              <div key={tile.title} className="lp-ws-tile">
                <SiteIcon name={tile.icon} size={15} />
                <span>
                  <strong>{tile.title}</strong>
                  <small>{tile.sub}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="lp-ws-today">
            <strong>Today</strong>
            {today.map((item) => (
              <div key={item.label} className={`lp-ws-row${item.done ? " is-done" : ""}`}>
                <span className="lp-ws-box">{item.done ? "✓" : ""}</span>
                {item.label}
                <em>›</em>
              </div>
            ))}
          </div>
        </div>
        <TabBar active="Workspace" />
      </div>
    </div>
  );
}

export function WebsiteHomePage() {
  return (
    <div className="lp">
      <section className="lp-hero" aria-label="Alenio home">
        <div className="lp-hero-glow" aria-hidden />
        <SiteHeader />

        <div className="lp-hero-main">
          <div className="lp-hero-copy">
            <p className="lp-badge">
              Built for frontline teams
            </p>
            <h1>
              Your Network.
              <br />
              Your Workspace.
              <br />
              <span className="lp-gradient-text">One Platform.</span>
            </h1>
            <p className="lp-hero-sub">
              Alenio brings together a professional network for frontline leaders and a workspace that runs your
              store&apos;s tasks, schedules, and checklists.
            </p>
            <div className="lp-hero-cta">
              <Link to="/sign-up" className="lp-btn lp-btn--primary lp-btn--lg">
                {MARKETING_CTA_START_FREE}
                <SiteIcon name="arrow" size={18} />
              </Link>
              <a href="#experiences" className="lp-btn lp-btn--ghost lp-btn--lg">
                <SiteIcon name="play" size={18} />
                See How It Works
              </a>
            </div>
            <ul className="lp-trust">
              {HERO_TRUST.map((item) => (
                <li key={item}>
                  <span aria-hidden>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="lp-hero-phones" aria-hidden>
            <NetworkPhone />
            <WorkspacePhone />
          </div>
        </div>
        <svg className="lp-hero-wave" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden>
          <path d="M0 96C240 150 480 160 760 118S1210 30 1440 70V160H0Z" />
        </svg>
      </section>

      <section id="experiences" className="lp-section lp-experiences" aria-labelledby="lp-exp-title">
        <p className="lp-kicker">Two experiences. One platform.</p>
        <h2 id="lp-exp-title">Built for frontline leaders and their teams.</h2>
        <div className="lp-exp-grid">
          <article id="network" className="lp-exp-card lp-exp-card--network">
            <span className="lp-exp-icon">
              <SiteIcon name="people" size={30} />
            </span>
            <div>
              <h3>
                The Alenio <span>Network</span>
              </h3>
              <p>A professional social network for frontline leaders to connect, share ideas, learn, and grow.</p>
              <ul>
                {NETWORK_POINTS.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </article>
          <span className="lp-exp-mark" aria-hidden>
            <img src="/alenio-mark-icon.svg" alt="" width={34} height={34} />
          </span>
          <article id="workspace" className="lp-exp-card lp-exp-card--workspace">
            <span className="lp-exp-icon">
              <SiteIcon name="layers" size={30} />
            </span>
            <div>
              <h3>
                The Alenio <span>Workspace</span>
              </h3>
              <p>A complete operations hub to run your business, develop your team, and drive results.</p>
              <ul>
                {WORKSPACE_POINTS.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </article>
        </div>

        <ul id="features" className="lp-features" aria-label="What's inside">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <SiteIcon name={feature.icon} size={30} />
              <strong>{feature.title}</strong>
              {feature.sub ? <small>{feature.sub}</small> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="lp-section lp-final">
        <div className="lp-final-card">
          <div>
            <h2>Connect people. Run operations. Elevate teams.</h2>
            <p>Join the Alenio community today — all in one app.</p>
          </div>
          <div className="lp-final-actions">
            <Link to="/sign-up" className="lp-btn lp-btn--light lp-btn--lg">
              {MARKETING_CTA_START_FREE}
              <SiteIcon name="arrow" size={18} />
            </Link>
            <Link to="/network" className="lp-btn lp-btn--ghost lp-btn--lg">
              Explore the Network
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
