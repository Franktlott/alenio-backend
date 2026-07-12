import type { ActivityFeedType } from "./types";

export type ActivityTint = "tasks" | "events" | "team" | "milestones" | "neutral";

export type ActivityTintTokens = {
  background: string;
  border: string;
  labelBg: string;
  labelText: string;
  accent: string;
  icon: string;
  rail: string;
};

export const ACTIVITY_LAYOUT = {
  cardRadius: 8,
  cardPadding: 10,
  cardGap: 4,
  cardMarginHorizontal: 16,
  cardMarginVertical: 3,
  sectionGap: 8,
  avatarSize: 32,
  avatarColumn: 38,
} as const;

export const ACTIVITY_COLORS = {
  primary: "#4361EE",
  purple: "#7C3AED",
  slate900: "#0F172A",
  slate700: "#334155",
  slate500: "#64748B",
  slate400: "#94A3B8",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",
  white: "#FFFFFF",
  sectionPillBg: "#F8FAFC",
  sectionPillText: "#64748B",
  sectionPillBorder: "#E2E8F0",
} as const;

/** Enterprise tints: white cards, muted labels, thin left rail */
const TINT_TOKENS: Record<ActivityTint, ActivityTintTokens> = {
  tasks: {
    background: "#FFFFFF",
    border: "#E2E8F0",
    labelBg: "transparent",
    labelText: "#047857",
    accent: "#059669",
    icon: "#059669",
    rail: "#059669",
  },
  events: {
    background: "#FFFFFF",
    border: "#E2E8F0",
    labelBg: "transparent",
    labelText: "#5B21B6",
    accent: "#6D28D9",
    icon: "#6D28D9",
    rail: "#6D28D9",
  },
  team: {
    background: "#FFFFFF",
    border: "#E2E8F0",
    labelBg: "transparent",
    labelText: "#3730A3",
    accent: "#4361EE",
    icon: "#4361EE",
    rail: "#4361EE",
  },
  milestones: {
    background: "#FFFFFF",
    border: "#E2E8F0",
    labelBg: "transparent",
    labelText: "#92400E",
    accent: "#B45309",
    icon: "#B45309",
    rail: "#D97706",
  },
  neutral: {
    background: "#FFFFFF",
    border: "#E2E8F0",
    labelBg: "transparent",
    labelText: "#475569",
    accent: "#64748B",
    icon: "#64748B",
    rail: "#94A3B8",
  },
};

export function getActivityTint(type: ActivityFeedType): ActivityTint {
  switch (type) {
    case "task_completed":
    case "task_assigned":
      return "tasks";
    case "calendar_event_added":
      return "events";
    case "member_joined":
    case "member_removed":
      return "team";
    case "task_milestone":
    case "personal_best":
    case "celebration":
      return "milestones";
    default:
      return "neutral";
  }
}

export function getActivityTintTokens(type: ActivityFeedType): ActivityTintTokens {
  if (type === "task_completed") {
    return {
      background: "#FFFFFF",
      border: "#E2E8F0",
      labelBg: "transparent",
      labelText: "#0F766E",
      accent: "#0D9488",
      icon: "#0D9488",
      rail: "#0D9488",
    };
  }
  return TINT_TOKENS[getActivityTint(type)];
}

export function getActivityTypeLabel(type: ActivityFeedType, metadata?: { eventCount?: number }): string {
  switch (type) {
    case "task_completed":
      return "Task Completed";
    case "task_assigned":
      return "Tasks Assigned";
    case "calendar_event_added": {
      const count = metadata?.eventCount ?? 1;
      return count > 1 ? `${count} Events Added` : "Event Added";
    }
    case "member_joined":
      return "Joined Team";
    case "member_removed":
      return "Left Team";
    case "task_milestone":
      return "Milestone";
    case "personal_best":
      return "Personal Best";
    case "celebration":
      return "Celebration";
    default:
      return "Update";
  }
}
