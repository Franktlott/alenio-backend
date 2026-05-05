import { Link } from "react-router-dom";

const highlights = [
  {
    title: "Real-time Team Communication",
    text: "Instant messaging, announcements, and shift updates keep everyone in the loop.",
  },
  {
    title: "Tasks That Get Done",
    text: "Assign tasks, set due times, and track progress in real time from chat to completion.",
  },
  {
    title: "Performance You Can See",
    text: "Dashboards and reports give leaders visibility into what matters most.",
  },
];

const industries = [
  {
    title: "Restaurants & Fast Food",
    points: ["Shift communication that works in the rush", "Task execution that drives consistency", "Manage visibility across every shift"],
  },
  {
    title: "Retail Stores",
    points: ["Daily task management and checklists", "Keep teams accountable and aligned", "Improve execution and customer experience"],
  },
  {
    title: "Convenience & Multi-Unit",
    points: ["Multi-location communication made simple", "Real-time updates and alerts", "Standardized execution everywhere"],
  },
  {
    title: "Field & Operations Teams",
    points: ["Keep distributed teams connected", "Share updates and files instantly", "Get work done, no matter where you are"],
  },
];

export function WebsiteHomePage() {
  return (
    <div className="site-v2">
      <section className="site-v2-hero">
        <header className="site-v2-header">
          <Link to="/" className="site-v2-brand" aria-label="Alenio home">
            <img src="/alenio-logo-white.png" alt="" className="site-v2-logo" />
            <span>Alenio</span>
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
            <Link to="/login" className="site-v2-head-cta">
              Start free today
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
            <p>
              Alenio helps retail, restaurant, and field teams communicate, execute, and stay accountable all from one
              place.
            </p>
            <div className="site-v2-hero-cta">
              <Link to="/login" className="site-v2-btn site-v2-btn-primary">
                Start free today
              </Link>
              <a href="#contact" className="site-v2-btn site-v2-btn-outline">
                Book a demo
              </a>
            </div>
            <ul className="site-v2-mini-list">
              <li>Real-time team chat</li>
              <li>Task to-do and ownership</li>
              <li>Track results in real time</li>
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
          <p>Designed for fast-paced, on-the-go teams.</p>
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
          <p>Alenio gives leaders real-time visibility so they can support their teams and make smarter decisions.</p>
          <ul>
            <li>Real-time dashboards</li>
            <li>Actionable insights</li>
            <li>Keep everyone accountable</li>
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
        <p>Alenio</p>
        <a href="mailto:hello@alenio.ai">hello@alenio.ai</a>
      </footer>
    </div>
  );
}
