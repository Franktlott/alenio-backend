import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type Props = {
  isOwner: boolean;
  teamId: string;
};

const DIRECTORY_ITEMS = [
  { key: "directory", label: "Team directory", icon: IconDirectory },
  { key: "checkins", label: "Check-ins & 1:1s", icon: IconCheckIns },
  { key: "goals", label: "Development goals", icon: IconGoals },
  { key: "recognition", label: "Recognition", icon: IconTrophy },
  { key: "timeline", label: "Performance timeline", icon: IconTimeline },
  { key: "documents", label: "Documents", icon: IconDocuments },
  { key: "history", label: "Member history", icon: IconHistory },
] as const;

const LEADER_CARDS = [
  {
    title: "View every team member",
    body: "See goals, check-ins, development and activity in one place.",
    icon: IconPeople,
  },
  {
    title: "Schedule recurring check-ins",
    body: "Automatically remind leaders to coach their people.",
    icon: IconClipboard,
  },
  {
    title: "Track development",
    body: "Assign goals and measure growth over time.",
    icon: IconTarget,
  },
  {
    title: "Celebrate great work",
    body: "Recognize wins and build a culture of appreciation.",
    icon: IconTrophy,
  },
  {
    title: "Monitor standards",
    body: "Know who is due for coaching before they become overdue.",
    icon: IconBars,
  },
  {
    title: "Stay accountable",
    body: "Build consistency with history, timelines, and clear expectations.",
    icon: IconShield,
  },
] as const;

const PREVIEW_MEMBERS = [
  {
    name: "Frank Lott",
    role: "Owner",
    initials: "FL",
    tone: "blue",
    lines: [
      { icon: "goals", text: "4 Active Goals" },
      { icon: "checkin", text: "Check-in due in 6 days" },
      { icon: "trophy", text: "18 Recognitions" },
    ],
  },
  {
    name: "Shevonne Harlee",
    role: "Member",
    initials: "SH",
    tone: "purple",
    lines: [
      { icon: "checkin", text: "Last 1:1 8 days ago" },
      { icon: "goals", text: "Development Plan" },
      { icon: "trophy", text: "2 Recognitions" },
    ],
  },
  {
    name: "Khristyan Tyson",
    role: "Member",
    initials: "KT",
    tone: "teal",
    lines: [
      { icon: "goals", text: "3 Active Goals" },
      { icon: "checkin", text: "Check-in due in 3 days" },
      { icon: "trophy", text: "5 Recognitions" },
    ],
  },
] as const;

function IconTeamMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 18.5c.8-2.8 3-4.5 5.5-4.5s4.7 1.7 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14.2 14.2c1.3-.7 2.8-1 4.3-.6 1.8.5 3.2 1.9 3.8 3.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDirectory() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.8 18.5C4.7 15.8 6.8 14 9 14s4.3 1.8 5.2 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 14.4c1.1-.6 2.4-.8 3.7-.5 1.5.4 2.7 1.6 3.2 3.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconCheckIns() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5V7M16 3.5V7M3.5 10h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 14.5h3.5M8.5 17.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconGoals() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 6H5.8A2.8 2.8 0 0 0 5.8 11.5C7 11.5 7.7 10.8 8 10M16 6h2.2A2.8 2.8 0 0 1 18.2 11.5C17 11.5 16.3 10.8 16 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 13.5h4L13.2 20h-2.4L10 13.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function IconTimeline() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 18V6M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 14l3.2-3.5 3 2.5L17.5 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDocuments() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 3.5V8h4.5M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4.5 5.5V9h3.5M12 8v4.5l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.8 18.5C4.7 15.8 6.8 14 9 14s4.3 1.8 5.2 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 14.4c1.1-.6 2.4-.8 3.7-.5 1.5.4 2.7 1.6 3.2 3.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="6" y="5" width="12" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 5.2V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5v.7M9 11h6M9 14.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

function IconBars() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 19V11M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 19 6.5v5.2c0 4.4-2.9 7.5-7 8.8-4.1-1.3-7-4.4-7-8.8V6.5L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m9.2 12 1.9 1.9 3.8-3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5 13.8 9.2 20.5 11 13.8 12.8 12 19.5 10.2 12.8 3.5 11 10.2 9.2 12 2.5Z" />
    </svg>
  );
}

function IconChevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M14.5 6.5 9 12l5.5 5.5" : "M9.5 6.5 15 12l-5.5 5.5"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PreviewLineIcon({ kind }: { kind: string }) {
  if (kind === "trophy") return <IconTrophy />;
  if (kind === "checkin") return <IconCheckIns />;
  return <IconGoals />;
}

export function TeamUpgradePanel({ isOwner, teamId }: Props) {
  const [previewIndex, setPreviewIndex] = useState(0);
  const billingTrialTo = useMemo(
    () => `/billing?teamId=${encodeURIComponent(teamId)}&subscribe=1`,
    [teamId],
  );
  const billingManageTo = useMemo(
    () => `/billing?teamId=${encodeURIComponent(teamId)}`,
    [teamId],
  );

  const visiblePreview = useMemo(() => {
    const a = PREVIEW_MEMBERS[previewIndex % PREVIEW_MEMBERS.length];
    const b = PREVIEW_MEMBERS[(previewIndex + 1) % PREVIEW_MEMBERS.length];
    const c = PREVIEW_MEMBERS[(previewIndex + 2) % PREVIEW_MEMBERS.length];
    return [a, b, c];
  }, [previewIndex]);

  return (
    <div className="team-upgrade" data-testid="team-upgrade-panel">
      <div className="team-upgrade-inner">
        <section className="team-upgrade-hero">
          <div className="team-upgrade-hero-copy">
            <div className="team-upgrade-kicker">
              <span className="team-upgrade-kicker-icon" aria-hidden>
                <IconTeamMark />
              </span>
              <span>Team</span>
            </div>
            <h1 className="team-upgrade-title">
              Build a workplace where{" "}
              <em>coaching, development,</em> and <em>accountability</em> happen every day.
            </h1>
            <p className="team-upgrade-sub">
              Team gives every leader the tools to connect, grow, and elevate their people.
            </p>
          </div>
          <div className="team-upgrade-hero-art" aria-hidden>
            <img src="/team-upgrade-hero.png" alt="" className="team-upgrade-hero-img" />
          </div>
        </section>

        <section className="team-upgrade-features">
          <div className="team-upgrade-directory">
            <h2 className="team-upgrade-section-title">Everything in one place</h2>
            <ul className="team-upgrade-directory-list">
              {DIRECTORY_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.key}>
                    <span className="team-upgrade-directory-icon" aria-hidden>
                      <Icon />
                    </span>
                    <span>{item.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="team-upgrade-leader">
            <h2 className="team-upgrade-section-title">What your leaders can do</h2>
            <div className="team-upgrade-leader-grid">
              {LEADER_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <article key={card.title} className="team-upgrade-leader-card">
                    <span className="team-upgrade-leader-icon" aria-hidden>
                      <Icon />
                    </span>
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="team-upgrade-preview" aria-label="Team preview">
          <header className="team-upgrade-preview-head">
            <div className="team-upgrade-preview-title-row">
              <span className="team-upgrade-preview-lock" aria-hidden>
                <IconLock />
              </span>
              <h2>See what your Team workspace looks like</h2>
            </div>
            <p>This is just a preview. Unlock Team to access everything.</p>
          </header>

          <div className="team-upgrade-preview-stage">
            <button
              type="button"
              className="team-upgrade-preview-nav"
              aria-label="Previous preview cards"
              onClick={() => setPreviewIndex((i) => (i + PREVIEW_MEMBERS.length - 1) % PREVIEW_MEMBERS.length)}
            >
              <IconChevron dir="left" />
            </button>

            <div className="team-upgrade-preview-cards">
              {visiblePreview.map((member) => (
                <article key={member.name} className="team-upgrade-member-card">
                  <div className="team-upgrade-member-top">
                    <span className={`team-upgrade-member-avatar team-upgrade-member-avatar--${member.tone}`}>
                      {member.initials}
                    </span>
                    <div>
                      <strong>{member.name}</strong>
                      <span>{member.role}</span>
                    </div>
                  </div>
                  <ul>
                    {member.lines.map((line) => (
                      <li key={line.text}>
                        <span aria-hidden>
                          <PreviewLineIcon kind={line.icon} />
                        </span>
                        <span>{line.text}</span>
                      </li>
                    ))}
                  </ul>
                  <footer>
                    <IconLock />
                    <span>Available with Team</span>
                  </footer>
                </article>
              ))}
            </div>

            <button
              type="button"
              className="team-upgrade-preview-nav"
              aria-label="Next preview cards"
              onClick={() => setPreviewIndex((i) => (i + 1) % PREVIEW_MEMBERS.length)}
            >
              <IconChevron dir="right" />
            </button>
          </div>
        </section>

        <section className="team-upgrade-cta">
          <div className="team-upgrade-cta-copy">
            <h2>Unlock Team</h2>
            <p>Everything you need to coach, develop, and grow your workplace.</p>
          </div>
          <div className="team-upgrade-cta-actions">
            {isOwner ? (
              <>
                <Link to={billingTrialTo} className="team-upgrade-cta-primary">
                  Start Free Trial
                  <IconSparkle />
                </Link>
                <p className="team-upgrade-cta-note">No credit card required</p>
                <div className="team-upgrade-cta-or" aria-hidden>
                  or
                </div>
                <Link to={billingManageTo} className="team-upgrade-cta-secondary">
                  Manage Workspace
                </Link>
              </>
            ) : (
              <>
                <p className="team-upgrade-cta-member">
                  Ask a workspace owner to upgrade so your team can unlock coaching, goals, and check-ins.
                </p>
                <Link to={billingManageTo} className="team-upgrade-cta-secondary">
                  View plans
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
