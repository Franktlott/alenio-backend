/** Shared Seneca Studio / Operational Context types (owner-agnostic). */

export type SenecaOwnerType = "GLOBAL" | "ORGANIZATION" | "WORKSPACE";
export type SenecaConfigType = "CORE" | "STUDIO" | "OPERATIONAL_CONTEXT";
export type SenecaConfigStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type SenecaTone = "supportive" | "balanced" | "direct";
export type SenecaResponseLength = "concise" | "standard" | "detailed";
export type SenecaCoachingStyle =
  | "development_first"
  | "balanced"
  | "accountability_first"
  | "recognition_focused"
  | "custom";

export type SenecaStudioData = {
  tone: SenecaTone;
  responseLength: SenecaResponseLength;
  coachingStyle: SenecaCoachingStyle;
  askFollowUps: boolean;
  alwaysDo: string[];
  neverDo: string[];
  leadershipPhilosophy: string;
  approvedTerms: string[];
  avoidedTerms: string[];
};

export type SenecaOperationalGoal = {
  id: string;
  title: string;
  description: string;
  targetDate: string | null;
  priority: "low" | "medium" | "high";
  status: "active" | "completed" | "paused";
};

export type SenecaOperationalContextData = {
  currentPriorities: string[];
  currentGoals: SenecaOperationalGoal[];
  currentInitiatives: string[];
  focusAreas: string[];
  workspaceNotes: string;
  recognitionPreferences: {
    publicRecognition: boolean;
    privateRecognition: boolean;
    celebrateMilestones: boolean;
    celebrateTrainingCompletion: boolean;
    celebrateCustomerWins: boolean;
  };
};

export const DEFAULT_STUDIO_DATA: SenecaStudioData = {
  tone: "balanced",
  responseLength: "standard",
  coachingStyle: "balanced",
  askFollowUps: true,
  alwaysDo: [
    "Give practical recommendations",
    "Focus on observable behavior",
    "Explain why the recommendation matters",
    "Celebrate wins when appropriate",
    "Recommend one next step",
    "Coach like an experienced frontline leader",
  ],
  neverDo: [
    "Invent employee history",
    "Recommend termination",
    "Give HR advice",
    "Give legal advice",
    "Shame team members",
    "Use corporate buzzwords",
  ],
  leadershipPhilosophy: "",
  approvedTerms: [
    "associate",
    "leader",
    "check-in",
    "development plan",
    "recognition",
    "shift",
    "store",
  ],
  avoidedTerms: ["employee", "write-up", "personnel issue"],
};

export const DEFAULT_OPERATIONAL_CONTEXT: SenecaOperationalContextData = {
  currentPriorities: [],
  currentGoals: [],
  currentInitiatives: [],
  focusAreas: [],
  workspaceNotes: "",
  recognitionPreferences: {
    publicRecognition: true,
    privateRecognition: true,
    celebrateMilestones: true,
    celebrateTrainingCompletion: true,
    celebrateCustomerWins: true,
  },
};

export const SENECA_PROMPT_TEMPLATE_KEYS = [
  { key: "general_coaching", title: "General Coaching" },
  { key: "check_in_prep", title: "Check-in Preparation" },
  { key: "development_plans", title: "Development Plans" },
  { key: "recognition", title: "Recognition" },
  { key: "notes_to_tasks", title: "Notes → Tasks" },
  { key: "task_prioritization", title: "Task Prioritization" },
  { key: "daily_summary", title: "Daily Summary" },
  { key: "shift_summary", title: "Shift Summary" },
  { key: "performance_review", title: "Performance Review" },
] as const;

export type SenecaPromptTemplateKey = (typeof SENECA_PROMPT_TEMPLATE_KEYS)[number]["key"];
