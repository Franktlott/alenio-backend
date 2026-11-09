export type HelpCategoryId =
  | "getting-started"
  | "people-chat"
  | "workspace"
  | "seneca"
  | "account-billing";

export type HelpArticleSection = {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
};

export type HelpArticle = {
  slug: string;
  categoryId: HelpCategoryId;
  title: string;
  summary: string;
  keywords: string[];
  readMinutes: number;
  featured?: boolean;
  youtubeId?: string;
  relatedSlugs?: string[];
  sections: HelpArticleSection[];
};

export type HelpCategory = {
  id: HelpCategoryId;
  title: string;
  description: string;
};

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Set up your profile and learn the basics of Alenio.",
  },
  {
    id: "people-chat",
    title: "Connections & chat",
    description: "Connect with people and communicate privately or in groups.",
  },
  {
    id: "workspace",
    title: "Workspace",
    description: "Manage shared work, check-ins, roles, and workspace access.",
  },
  {
    id: "seneca",
    title: "Seneca AI",
    description: "Use personal and workspace AI safely and effectively.",
  },
  {
    id: "account-billing",
    title: "Account & billing",
    description: "Control privacy, security, subscriptions, and account access.",
  },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "get-started-with-alenio",
    categoryId: "getting-started",
    title: "Get started with Alenio",
    summary: "Set up your identity, find your way around, and choose where to begin.",
    keywords: ["start", "setup", "profile", "navigation", "account"],
    readMinutes: 3,
    featured: true,
    relatedSlugs: [
      "join-and-switch-workspaces",
      "connections-and-direct-messages",
      "use-seneca-ai",
    ],
    sections: [
      {
        heading: "Your first few minutes",
        paragraphs: [
          "Alenio brings conversations, shared work, development, and AI guidance into one place. You can use personal features without joining a workspace, then add workspace tools when your team is ready.",
        ],
        steps: [
          "Open Profile and add your name, username, photo, and professional details.",
          "Open Connections to find people you know or accept a request.",
          "Use Chat to start a direct message or create a group.",
          "If you belong to a workspace, open Workspace to review its calendar, tasks, and feed.",
          "Open Seneca for personal guidance or select an available workspace context.",
        ],
      },
      {
        heading: "Personal and workspace areas",
        bullets: [
          "Connections and personal conversations belong to your Alenio account.",
          "Tasks, check-ins, calendars, goals, and team activity belong to a specific workspace.",
          "Your available actions can change based on your workspace role and plan status.",
        ],
      },
    ],
  },
  {
    slug: "join-and-switch-workspaces",
    categoryId: "getting-started",
    title: "Join and switch workspaces",
    summary: "Accept an invitation and move between the workplaces available to you.",
    keywords: ["join", "invite", "switch", "workspace", "team"],
    readMinutes: 2,
    featured: true,
    sections: [
      {
        heading: "Join a workspace",
        steps: [
          "Open the invitation link sent by your workspace owner or leader.",
          "Sign in with the email address associated with the invitation.",
          "Review the workspace name and accept the invitation.",
          "Return to the Workspace tab to see the shared workspace experience.",
        ],
      },
      {
        heading: "Switch your active workspace",
        paragraphs: [
          "The Workspace header always shows the active workspace. Tap the workspace name to choose another workspace when more than one is available.",
        ],
        bullets: [
          "Switching changes the workspace data shown in Calendar, Tasks, Feed, and workspace Seneca.",
          "Your personal Connections, profile, and direct messages remain available across workspaces.",
        ],
      },
    ],
  },
  {
    slug: "connections-and-direct-messages",
    categoryId: "people-chat",
    title: "Connections and direct messages",
    summary: "Understand connections, requests, discovery, and private conversations.",
    keywords: ["connection", "request", "message", "direct message", "dm", "people"],
    readMinutes: 3,
    featured: true,
    sections: [
      {
        heading: "Connect with someone",
        steps: [
          "Open Connections and search for a person on Alenio.",
          "Select Connect to send a request.",
          "After the request is accepted, the person appears in your Connections list.",
        ],
      },
      {
        heading: "Start a conversation",
        steps: [
          "Open Chat and select the plus button.",
          "Search your connections or discover another Alenio member.",
          "Select a connection to open or create a direct conversation.",
        ],
        bullets: [
          "Groups can include direct connections and eligible workspace members.",
          "Blocking a person prevents new direct interaction, but workspace information can still be visible according to workspace permissions.",
        ],
      },
    ],
  },
  {
    slug: "workspace-calendar-tasks-and-feed",
    categoryId: "workspace",
    title: "Use Calendar, Tasks, and Feed",
    summary: "Plan work, review assignments, and follow workspace activity.",
    keywords: ["calendar", "tasks", "feed", "events", "week", "schedule"],
    readMinutes: 4,
    featured: true,
    relatedSlugs: [
      "workspace-roles-and-read-only-access",
      "check-ins-goals-and-development-plans",
      "plans-billing-and-workspace-access",
    ],
    sections: [
      {
        heading: "Calendar",
        paragraphs: [
          "Calendar combines scheduled workspace items in month and week views. Select a day to review what is planned, then open an item for its details.",
        ],
      },
      {
        heading: "Tasks",
        paragraphs: [
          "Tasks shows the work available to your role. Owners and leaders can review team work, while members focus on their own assignments.",
        ],
        bullets: [
          "Use filters to narrow the list by status, assignee, or date.",
          "Open a task to review its details, updates, and available actions.",
          "Read-only workspaces continue to show existing information but prevent changes.",
        ],
      },
      {
        heading: "Feed",
        paragraphs: [
          "Feed presents workspace activity such as completed work, events, milestones, and recognition. Use it to understand what changed without opening every item.",
        ],
      },
    ],
  },
  {
    slug: "workspace-roles-and-read-only-access",
    categoryId: "workspace",
    title: "Workspace roles and read-only access",
    summary: "Learn what Owners, Admins, Leaders, and Members can do.",
    keywords: ["owner", "admin", "leader", "member", "permissions", "read only", "roles"],
    readMinutes: 3,
    sections: [
      {
        heading: "Workspace roles",
        bullets: [
          "Owner: controls the workspace, billing, ownership, and the highest-risk settings.",
          "Admin: has the administrative access configured by the workspace permission model.",
          "Leader: manages people and day-to-day team work when permitted.",
          "Member: participates in assigned work, conversations, check-ins, and development.",
        ],
      },
      {
        heading: "When a workspace is read-only",
        paragraphs: [
          "A workspace can become read-only when its trial or paid access ends. Existing workspace information remains visible, but actions that create, edit, complete, or delete workspace content are blocked.",
        ],
        bullets: [
          "Owners see an option to review available plans.",
          "Other members see that the workspace owner can restore access.",
          "Personal Alenio features remain separate from the workspace restriction.",
        ],
      },
    ],
  },
  {
    slug: "check-ins-goals-and-development-plans",
    categoryId: "workspace",
    title: "Check-ins, goals, and development plans",
    summary: "Use Alenio’s development tools to prepare, follow up, and track growth.",
    keywords: ["check-in", "one-on-one", "goal", "development", "coaching", "plan"],
    readMinutes: 4,
    sections: [
      {
        heading: "Plan a check-in",
        steps: [
          "Open the member’s workspace profile or the relevant check-in area.",
          "Choose a template and schedule the conversation.",
          "Review the agenda and add the topics that need attention.",
          "Complete the check-in and capture appropriate follow-up work.",
        ],
      },
      {
        heading: "Track development",
        bullets: [
          "Development goals describe the outcome a member is working toward.",
          "Development plans organize skills, action steps, and progress notes.",
          "Visibility and management actions follow workspace roles and permissions.",
        ],
      },
    ],
  },
  {
    slug: "use-seneca-ai",
    categoryId: "seneca",
    title: "Use Seneca AI",
    summary: "Choose the right context, ask better questions, and manage saved chats.",
    keywords: ["seneca", "ai", "prompt", "personal", "workspace", "history", "privacy"],
    readMinutes: 4,
    featured: true,
    relatedSlugs: [
      "get-started-with-alenio",
      "privacy-security-and-account-controls",
      "connections-and-direct-messages",
    ],
    sections: [
      {
        heading: "Choose a context",
        bullets: [
          "Personal context uses your personal Alenio experience and does not expose a workspace’s private management data.",
          "Workspace context uses information you are permitted to access in the selected workspace.",
          "Always review AI output before using it for workplace decisions.",
        ],
      },
      {
        heading: "Ask Seneca",
        steps: [
          "Open Seneca and select Personal or an available workspace.",
          "Describe the outcome you want and include useful constraints.",
          "Attach one supported image or PDF when the source material matters.",
          "Review the response, then refine your request if needed.",
        ],
      },
      {
        heading: "Saved chats and generated images",
        paragraphs: [
          "Seneca chats, generated text, attachments, and generated images are retained for seven days after the latest message. Deleting a chat removes its retained generated content.",
        ],
        bullets: [
          "Image generation and editing share a plan-aware usage limit.",
          "Generated images can be shared to eligible direct messages and groups.",
          "Seneca applies workplace image-safety checks to generation and editing.",
        ],
      },
    ],
  },
  {
    slug: "plans-billing-and-workspace-access",
    categoryId: "account-billing",
    title: "Plans, billing, and workspace access",
    summary: "Understand workspace plans, checkout, and who can manage billing.",
    keywords: ["plan", "billing", "subscription", "pro", "operations", "trial", "owner"],
    readMinutes: 3,
    sections: [
      {
        heading: "Who manages billing",
        paragraphs: [
          "Only the workspace Owner can start checkout or manage the workspace subscription. Billing changes apply to that workspace rather than the owner’s personal Alenio account.",
        ],
      },
      {
        heading: "Choose a plan",
        steps: [
          "Open Workspace settings and select Subscription & billing.",
          "Review the available plan and included workspace capabilities.",
          "Continue to the secure Stripe checkout when you are ready.",
          "Return to Alenio after checkout and allow the workspace status to refresh.",
        ],
      },
      {
        heading: "If access does not update",
        bullets: [
          "Confirm that checkout completed successfully.",
          "Refresh the workspace or reopen the app.",
          "Contact Alenio support with the workspace name—never send payment-card details.",
        ],
      },
    ],
  },
  {
    slug: "privacy-security-and-account-controls",
    categoryId: "account-billing",
    title: "Privacy, security, and account controls",
    summary: "Manage messaging privacy, blocked people, account access, and deletion.",
    keywords: ["privacy", "security", "block", "password", "email", "delete account"],
    readMinutes: 4,
    sections: [
      {
        heading: "Personal controls",
        bullets: [
          "Use Profile settings to manage your username, email, notifications, privacy, and security.",
          "Messaging privacy controls who can start a new conversation with you.",
          "Blocked people cannot start new direct interactions with you.",
        ],
      },
      {
        heading: "Workspace visibility",
        paragraphs: [
          "Workspace content follows workspace roles, permissions, and organizational access. Personal connections remain account-level and are not owned by a workspace.",
        ],
      },
      {
        heading: "Delete your account",
        paragraphs: [
          "Account deletion is permanent and can be limited by active workspace ownership or billing responsibilities. Review the deletion screen carefully and resolve any listed blockers first.",
        ],
      },
    ],
  },
];

export function helpCategory(categoryId: HelpCategoryId): HelpCategory {
  return (
    HELP_CATEGORIES.find((category) => category.id === categoryId) ??
    HELP_CATEGORIES[0]!
  );
}

export function helpArticleBySlug(slug: string | undefined): HelpArticle | null {
  if (!slug) return null;
  return HELP_ARTICLES.find((article) => article.slug === slug) ?? null;
}

export function searchHelpArticles(
  query: string,
  categoryId?: HelpCategoryId | "all",
): HelpArticle[] {
  const normalized = query.trim().toLocaleLowerCase();
  return HELP_ARTICLES.filter((article) => {
    if (categoryId && categoryId !== "all" && article.categoryId !== categoryId) {
      return false;
    }
    if (!normalized) return true;
    const searchable = [
      article.title,
      article.summary,
      ...article.keywords,
      ...article.sections.flatMap((section) => [
        section.heading,
        ...(section.paragraphs ?? []),
        ...(section.steps ?? []),
        ...(section.bullets ?? []),
      ]),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(normalized);
  });
}
