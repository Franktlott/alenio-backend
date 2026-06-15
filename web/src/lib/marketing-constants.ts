import { LEGAL_CONTACT_EMAIL } from "./legal-constants";

export type MarketingNavId = "how-it-works" | "pricing" | "enterprise" | "security";

export const MARKETING_CTA_START_FREE = "Start free";
export const MARKETING_CTA_REQUEST_DEMO = "Request demo";
export const MARKETING_CTA_JOIN = "Join Alenio";

export const MARKETING_DEMO_HREF = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent("Alenio demo request")}`;

export const MARKETING_HERO_HEADLINE = "The operating system for";
export const MARKETING_HERO_HEADLINE_ACCENT = "team execution.";
export const MARKETING_HERO_SUBCOPY =
  "Alenio unifies chat, tasks, and calendar for frontline teams — so managers spend less time chasing updates and more time coaching.";

export const MARKETING_FINAL_CTA_HEADLINE = "Stop guessing. Start executing.";
export const MARKETING_FINAL_CTA_SUBCOPY =
  "Create a free account in minutes. Upgrade when your team is ready for full execution tools.";

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
    "Roll out Alenio across stores, districts, and regions with workspace-level billing, owner controls, and support built for operators who run at scale.",
};

export const ENTERPRISE_PAGE_PILLARS = [
  {
    title: "Roll out with confidence",
    points: [
      "Workspace-per-location billing and ownership",
      "Templates for opening, closing, and visit checklists",
      "Consistent playbooks pushed to every site",
    ],
  },
  {
    title: "Lead from the field",
    points: [
      "Visibility into chat, tasks, and calendar by workspace",
      "Activity feed for what changed across teams",
      "Coaching workflows for managers and DMs",
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
