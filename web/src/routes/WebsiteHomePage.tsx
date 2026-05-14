import { Link } from "react-router-dom";

const highlights = [
  {
    title: "Real-time Team Communication",
    text: "Channels, DMs, polls, and video calls from chat.",
  },
  {
    title: "Tasks That Get Done",
    text: "Owners, due dates, subtasks, files, and templates.",
  },
  {
    title: "Visibility That Drives Action",
    text: "Tasks, calendar, and video meetings in one place.",
  },
];

const industries = [
  {
    title: "Restaurants & Fast Food",
    points: ["Chat, polls, and video for shifts", "Tasks with subtasks and photos", "Calendar for trainings and visits"],
  },
  {
    title: "Retail Stores",
    points: ["DMs, channels, and polls", "Tasks and files for standards", "Calendar + tasks on the web"],
  },
  {
    title: "Convenience & C-Stores",
    points: ["Polls, chat, and video", "Checklist tasks with proof", "See work across stores"],
  },
  {
    title: "Multifamily & Apartment Communities",
    points: ["Channels and DMs for staff", "Work orders as tasks with photos", "Calendar for tours and vendors"],
  },
];

export function WebsiteHomePage() {
  return (
    <div className="site-v2">
      <section className="site-v2-hero">
        <header className="site-v2-header">
          <Link to="/" className="site-v2-brand" aria-label="Alenio home">
            <img src="/alenio-logo-white.png" alt="Alenio" className="site-v2-logo-full" width={168} height={40} />
          </Link>
          <nav className="site-v2-nav" aria-label="Primary">
            <a href="#features">Product</a>
            <a href="#industries">Solutions</a>
            <a href="#pricing">Pricing</a>
            <a href="#resources">Resources</a>
            <a href="#about">About</a>
          </nav>
          <div className="site-v2-head-actions">
            <Link to="/login" className="site-v2-login">
              Log in
            </Link>
            <Link to="/sign-up" className="site-v2-head-cta">
              Start with Team
            </Link>
          </div>
        </header>

        <div className="site-v2-hero-main">
          <div className="site-v2-hero-copy">
            <h1>
              Built for teams
              <br />
              that <span>move fast.</span>
            </h1>
            <p>One app for chat, tasks, calendar, and video.</p>
            <div className="site-v2-hero-cta">
              <Link to="/sign-up" className="site-v2-btn site-v2-btn-primary">
                Start with Team
              </Link>
              <a href="#contact" className="site-v2-btn site-v2-btn-outline">
                Book a demo
              </a>
            </div>
            <ul className="site-v2-mini-list">
              <li>Chat, DMs, polls, video</li>
              <li>Tasks, subtasks, files</li>
              <li>Calendar and meetings</li>
            </ul>
          </div>
          <div className="site-v2-hero-visual" aria-hidden>
            <div className="site-v2-device-phone" />
            <div className="site-v2-device-dashboard" />
          </div>
        </div>
      </section>

      <section id="features" className="site-v2-section">
        <h2>Everything your team needs to win the day.</h2>
        <div className="site-v2-feature-grid">
          {highlights.map((item) => (
            <article key={item.title} className="site-v2-feature-card">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <a href="#resources">Learn more →</a>
            </article>
          ))}
        </div>
      </section>

      <section id="industries" className="site-v2-section">
        <div className="site-v2-center-head">
          <h2>Built for your industry</h2>
          <p>Busy teams. Short updates.</p>
        </div>
        <div className="site-v2-industry-grid">
          {industries.map((industry) => (
            <article key={industry.title} className="site-v2-industry-card">
              <h3>{industry.title}</h3>
              <ul>
                {industry.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="about" className="site-v2-section site-v2-ops">
        <div className="site-v2-ops-board" aria-hidden />
        <div className="site-v2-ops-copy">
          <h2>
            See the big picture.
            <br />
            Drive the right action.
          </h2>
          <p>Same tools for the floor and the office.</p>
          <ul>
            <li>Web: tasks and calendar together</li>
            <li>Polls, channels, quick video</li>
            <li>Owners, due dates, subtasks</li>
          </ul>
        </div>
      </section>

      <section id="pricing" className="site-v2-bottom">
        <div className="site-v2-quote">
          <p>
            “Alenio has completely changed the way we communicate and execute. Our team is more connected and more
            accountable.”
          </p>
          <span>Mark T. · Area Manager</span>
        </div>
        <div className="site-v2-cta">
          <h2>Stop guessing. Start executing.</h2>
          <p>Join thousands of teams that rely on Alenio to run better every day.</p>
          <div className="site-v2-hero-cta">
            <Link to="/login" className="site-v2-btn site-v2-btn-primary">
              Start your free trial
            </Link>
            <a href="#contact" className="site-v2-btn site-v2-btn-outline">
              Book a demo
            </a>
          </div>
        </div>
      </section>

      <footer id="contact" className="site-v2-footer">
        <img src="/alenio-logo.png" alt="Alenio" className="site-v2-footer-logo" width={140} height={34} />
        <a href="mailto:hello@alenio.ai">hello@alenio.ai</a>
      </footer>
    </div>
  );
}
