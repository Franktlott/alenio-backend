import type { LucideIcon } from "lucide-react-native";
import {
  Award,
  Flag,
  Flame,
  Heart,
  Lightbulb,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react-native";

export type CelebrationTypeKey =
  | "shoutout"
  | "mvp"
  | "beyond"
  | "rockstar"
  | "clutch"
  | "teamplayer"
  | "bigbrain"
  | "onfire"
  | "milestone"
  | "grateful";

export type CelebrationHeroStyle = "medal" | "burst" | "bolt" | "target" | "flame" | "heart" | "bulb" | "flag" | "users" | "trophy";

export type CelebrationTheme = {
  key: CelebrationTypeKey;
  Icon: LucideIcon;
  label: string;
  tag: string;
  blurb: string;
  emoji: string;
  accent: string;
  accentSoft: string;
  glow: string;
  gradient: [string, string, string];
  quoteBg: string;
  quoteMark: string;
  medal: [string, string];
  hero: CelebrationHeroStyle;
  chip: string;
};

export const CELEBRATION_CARD_THEMES: Record<CelebrationTypeKey, CelebrationTheme> = {
  shoutout: {
    key: "shoutout",
    Icon: Star,
    label: "Shoutout",
    tag: "Recognition",
    blurb: "Call out great work in the moment",
    emoji: "⭐",
    accent: "#FBBF24",
    accentSoft: "#FDE68A",
    glow: "rgba(251,191,36,0.5)",
    gradient: ["#92400E", "#D97706", "#F59E0B"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#FDE68A",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "burst",
    chip: "#D97706",
  },
  mvp: {
    key: "mvp",
    Icon: Trophy,
    label: "MVP",
    tag: "Most Valuable",
    blurb: "Highlight the standout teammate",
    emoji: "🏆",
    accent: "#C4B5FD",
    accentSoft: "#DDD6FE",
    glow: "rgba(167,139,250,0.55)",
    gradient: ["#4C1D95", "#7C3AED", "#A78BFA"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#DDD6FE",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "trophy",
    chip: "#7C3AED",
  },
  beyond: {
    key: "beyond",
    Icon: Award,
    label: "Above & Beyond",
    tag: "Top Performer",
    blurb: "Recognize exceptional effort",
    emoji: "🏅",
    accent: "#6EE7B7",
    accentSoft: "#A7F3D0",
    glow: "rgba(52,211,153,0.55)",
    gradient: ["#064E3B", "#059669", "#34D399"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#6EE7B7",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "medal",
    chip: "#059669",
  },
  rockstar: {
    key: "rockstar",
    Icon: Zap,
    label: "Rockstar",
    tag: "High Impact",
    blurb: "Celebrate high-energy wins",
    emoji: "⚡",
    accent: "#FDBA74",
    accentSoft: "#FED7AA",
    glow: "rgba(251,146,60,0.55)",
    gradient: ["#9A3412", "#EA580C", "#FB923C"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#FED7AA",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "bolt",
    chip: "#EA580C",
  },
  clutch: {
    key: "clutch",
    Icon: Target,
    label: "Clutch",
    tag: "Clutch Play",
    blurb: "When they delivered under pressure",
    emoji: "🎯",
    accent: "#FCA5A5",
    accentSoft: "#FECACA",
    glow: "rgba(248,113,113,0.55)",
    gradient: ["#7F1D1D", "#DC2626", "#F87171"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#FECACA",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "target",
    chip: "#DC2626",
  },
  teamplayer: {
    key: "teamplayer",
    Icon: Users,
    label: "Team Player",
    tag: "Team Impact",
    blurb: "Credit someone who lifts the team",
    emoji: "🤝",
    accent: "#93C5FD",
    accentSoft: "#BFDBFE",
    glow: "rgba(96,165,250,0.55)",
    gradient: ["#1E3A8A", "#2563EB", "#60A5FA"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#BFDBFE",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "users",
    chip: "#1D4ED8",
  },
  bigbrain: {
    key: "bigbrain",
    Icon: Lightbulb,
    label: "Big Brain",
    tag: "Problem Solver",
    blurb: "Smart thinking that moved work forward",
    emoji: "💡",
    accent: "#67E8F9",
    accentSoft: "#A5F3FC",
    glow: "rgba(34,211,238,0.55)",
    gradient: ["#155E75", "#0891B2", "#22D3EE"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#A5F3FC",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "bulb",
    chip: "#0891B2",
  },
  onfire: {
    key: "onfire",
    Icon: Flame,
    label: "On Fire",
    tag: "On a Roll",
    blurb: "Momentum that deserves a shout",
    emoji: "🔥",
    accent: "#FDBA74",
    accentSoft: "#FED7AA",
    glow: "rgba(251,146,60,0.5)",
    gradient: ["#7C2D12", "#C2410C", "#F97316"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#FED7AA",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "flame",
    chip: "#EA580C",
  },
  milestone: {
    key: "milestone",
    Icon: Flag,
    label: "Milestone",
    tag: "Milestone Hit",
    blurb: "Mark a meaningful achievement",
    emoji: "🏁",
    accent: "#C4B5FD",
    accentSoft: "#DDD6FE",
    glow: "rgba(167,139,250,0.55)",
    gradient: ["#5B21B6", "#7C3AED", "#A78BFA"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#DDD6FE",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "flag",
    chip: "#7C3AED",
  },
  grateful: {
    key: "grateful",
    Icon: Heart,
    label: "Grateful",
    tag: "Team Spirit",
    blurb: "Say thank you with intention",
    emoji: "💜",
    accent: "#FDA4AF",
    accentSoft: "#FECDD3",
    glow: "rgba(251,113,133,0.55)",
    gradient: ["#9F1239", "#E11D48", "#FB7185"],
    quoteBg: "rgba(255,255,255,0.12)",
    quoteMark: "#FECDD3",
    medal: ["#FDE68A", "#F59E0B"],
    hero: "heart",
    chip: "#E11D48",
  },
};

export const CELEBRATION_TYPE_KEYS = Object.keys(CELEBRATION_CARD_THEMES) as CelebrationTypeKey[];

export function getCelebrationCardTheme(typeKey?: string): CelebrationTheme {
  if (typeKey && typeKey in CELEBRATION_CARD_THEMES) {
    return CELEBRATION_CARD_THEMES[typeKey as CelebrationTypeKey];
  }
  return CELEBRATION_CARD_THEMES.shoutout;
}
