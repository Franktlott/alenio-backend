import { LEGAL_CONTACT_EMAIL } from "./legal-constants";

export type MarketingNavId = "how-it-works" | "pricing" | "enterprise" | "security";

export const MARKETING_CTA_START_FREE = "Start free";
export const MARKETING_CTA_REQUEST_DEMO = "Request demo";
export const MARKETING_CTA_JOIN = "Join Alenio";

export const MARKETING_DEMO_HREF = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent("Alenio demo request")}`;

export const MARKETING_HERO_HEADLINE = "The operating system for";
export const MARKETING_HERO_HEADLINE_ACCENT = "team execution.";
export const MARKETING_HERO_SUBCOPY =
  "Alenio unifies chat, tasks, and calendar — plus Seneca AI coaching, 1:1 check-ins, and development plans — so managers spend less time chasing updates and more time leading the floor.";

export const MARKETING_FINAL_CTA_HEADLINE = "Stop guessing. Start executing.";
export const MARKETING_FINAL_CTA_SUBCOPY =
  "Create a free account in minutes. Upgrade when your team is ready for Seneca AI, check-ins, and full execution tools.";

export const MARKETING_SENECA_SECTION = {
  eyebrow: "Seneca AI",
  title: "Your manager's AI chief of staff",
  subcopy:
    "Seneca is built for frontline leaders — not generic help. It surfaces what needs attention, preps you for 1:1s, turns notes into tasks, and helps you recognize wins across your workspace.",
  insightExample:
    "You have 3 overdue tasks, 1 missed checklist, and Vera hasn't had a check-in in 42 days.",
  prompts: [
    "What needs my attention?",
    "Prep a 1:1",
    "Turn notes into tasks",
    "Recognize a team win",
  ] as const,
  capabilities: [
    {
      title: "Floating coaching assistant",
      desc: "Always-visible Seneca button with manager quick prompts and suggested actions.",
    },
    {
      title: "Check-in prep & review",
      desc: "Pre-meeting briefs, leadership review, and follow-up tasks inside every 1:1.",
    },
    {
      title: "Development plan generation",
      desc: "Draft 30-day growth plans and skill steps with Seneca — you approve before saving.",
    },
    {
      title: "Template & goal generation",
      desc: "Build check-in templates and development goals from a short brief.",
    },
  ] as const,
};

export const MARKETING_COACHING_PILLARS = [
  {
    title: "Seneca AI coaching",
    icon: "seneca",
    points: [
      "Always-on assistant for managers",
      "Workspace-aware attention alerts",
      "Suggested follow-ups and recognition",
    ],
  },
  {
    title: "Structured 1:1 check-ins",
    icon: "checkin",
    points: [
      "Custom templates with leader prep",
      "Seneca prep before every check-in",
      "Follow-up tasks and associate feedback",
    ],
  },
  {
    title: "Development plans",
    icon: "growth",
    points: [
      "Skill goals with action steps",
      "Generate plans with Seneca",
      "Track progress on member profiles",
    ],
  },
] as const;

/** Illustrative dashboard metrics — not live customer data. */
export const MARKETING_EXAMPLE_METRICS = [
  { label: "Shift completion rate", value: "—" },
  { label: "Tasks completed today", value: "—" },
  { label: "Overdue tasks", value: "—" },
] as const;

export const MARKETING_EXAMPLE_BADGE = "Example";

export const ENTERPRISE_PLAN_NAME = "Enterprise";
export const ENTERPRISE_PLAN_TAGLINE = "For multi-location operators that need rollout, control, and support";
export const ENTERPRISE_PLAN_PRICE = "Custom";
export const ENTERPRISE_PLAN_PERIOD = "tailored to your organization";
export const ENTERPRISE_PLAN_FEATURES = [
  "Everything in Team",
  "Multi-workspace administration",
  "Dedicated onboarding & rollout",
  "Priority support with SLA",
  "Security review & compliance packet",
  "Custom training for field leaders",
] as const;

export const ENTERPRISE_PAGE_HERO = {
  title: "Enterprise execution at every location",
  subcopy:
    "Roll out Alenio across stores, districts, and regions with Seneca AI coaching, check-in playbooks, development plans, and workspace-level control built for operators who run at scale.",
};

export const ENTERPRISE_PAGE_PILLARS = [
  {
    title: "Roll out with confidence",
    points: [
      "Workspace-per-location billing and ownership",
      "Checklists, check-in templates, and leader prep",
      "Consistent playbooks pushed to every site",
    ],
  },
  {
    title: "Coach at every layer",
    points: [
      "Seneca AI for district and store managers",
      "1:1 check-ins with prep, notes, and follow-ups",
      "Development plans tied to member profiles",
    ],
  },
  {
    title: "Partner with our team",
    points: [
      "Dedicated onboarding for your first locations",
      "Priority support with response-time commitments",
      "Security documentation for your review",
    ],
  },
] as const;

export const SECURITY_PAGE_HERO = {
  title: "Security built for operational teams",
  subcopy:
    "Alenio is designed to protect workspace data, authenticate users reliably, and give your organization clear policies for access and account lifecycle.",
};

export const SECURITY_PAGE_SECTIONS = [
  {
    title: "Authentication & access",
    points: [
      "Email verification for new accounts",
      "Session-based access with sign-out across devices",
      "Workspace membership controlled by owners and invites",
    ],
  },
  {
    title: "Data handling",
    points: [
      "Encrypted connections (HTTPS/TLS) for web and API traffic",
      "Workspace data scoped to team membership",
      "Account deletion flow documented for users and admins",
    ],
  },
  {
    title: "Policies & contact",
    points: [
      "Privacy Policy and Terms of Service published on the website",
      "Account deletion instructions for end users",
      `Security questions: ${LEGAL_CONTACT_EMAIL}`,
    ],
  },
] as const;
