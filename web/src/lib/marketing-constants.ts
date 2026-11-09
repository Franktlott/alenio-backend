import { LEGAL_CONTACT_EMAIL } from "./legal-constants";

export const MARKETING_CTA_START_FREE = "Start Free Trial";
export const MARKETING_CTA_REQUEST_DEMO = "Request demo";

export const MARKETING_DEMO_HREF = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent("Alenio demo request")}`;

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
      "Check-ins with prep, notes, and follow-ups",
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
      "Outlook calendar sync is read-only with encrypted OAuth tokens",
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
