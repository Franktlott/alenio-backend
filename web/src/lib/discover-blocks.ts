import {
  BookOpen,
  Check,
  Clock,
  Compass,
  Heart,
  Lightbulb,
  MessageCircle,
  Rocket,
  Shield,
  Smile,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Icon and tone names are stored in the article, so the phone app maps the same names. */
export const DISCOVER_ICONS: Record<string, { label: string; Icon: LucideIcon }> = {
  users: { label: "People", Icon: Users },
  target: { label: "Target", Icon: Target },
  zap: { label: "Lightning", Icon: Zap },
  heart: { label: "Heart", Icon: Heart },
  rocket: { label: "Rocket", Icon: Rocket },
  star: { label: "Star", Icon: Star },
  lightbulb: { label: "Idea", Icon: Lightbulb },
  shield: { label: "Shield", Icon: Shield },
  message: { label: "Conversation", Icon: MessageCircle },
  compass: { label: "Compass", Icon: Compass },
  trophy: { label: "Trophy", Icon: Trophy },
  sparkles: { label: "Sparkles", Icon: Sparkles },
  check: { label: "Check", Icon: Check },
  clock: { label: "Clock", Icon: Clock },
  book: { label: "Book", Icon: BookOpen },
  smile: { label: "Smile", Icon: Smile },
};

export const DISCOVER_TONES: Record<string, { label: string; fg: string; bg: string; border: string }> = {
  purple: { label: "Purple", fg: "#6d28d9", bg: "#f1ecff", border: "#e4dcfd" },
  blue: { label: "Blue", fg: "#2563eb", bg: "#e8f0fe", border: "#d6e4fd" },
  green: { label: "Green", fg: "#15803d", bg: "#e7f8ee", border: "#cdeedb" },
  orange: { label: "Orange", fg: "#c2410c", bg: "#fff1e6", border: "#fde0c8" },
  pink: { label: "Pink", fg: "#be185d", bg: "#fdeef5", border: "#fbd5e6" },
  teal: { label: "Teal", fg: "#0f766e", bg: "#e6f7f5", border: "#c9ece7" },
};

export type DiscoverBlockLayout = "full" | "side";

export type DiscoverCalloutAttrs = {
  icon: string;
  tone: string;
  title: string;
  text: string;
  layout: DiscoverBlockLayout;
};

export type DiscoverCard = { icon: string; tone: string; kicker: string; title: string; text: string };
export type DiscoverCardGridAttrs = { cards: DiscoverCard[] };

export type DiscoverChecklistAttrs = {
  icon: string;
  tone: string;
  title: string;
  items: string[];
  layout: DiscoverBlockLayout;
};

export const MAX_DISCOVER_CARDS = 4;

export function discoverIcon(name: string | undefined): LucideIcon {
  return DISCOVER_ICONS[name ?? ""]?.Icon ?? Sparkles;
}

export function discoverTone(name: string | undefined) {
  return DISCOVER_TONES[name ?? ""] ?? DISCOVER_TONES.purple!;
}

export const DEFAULT_CALLOUT: DiscoverCalloutAttrs = {
  icon: "target",
  tone: "purple",
  title: "Key idea",
  text: "Summarize the one thing readers should remember.",
  layout: "full",
};

export const DEFAULT_CARDS: DiscoverCardGridAttrs = {
  cards: [
    { icon: "users", tone: "purple", kicker: "1", title: "First point", text: "Explain it in a sentence or two." },
    { icon: "target", tone: "blue", kicker: "2", title: "Second point", text: "Explain it in a sentence or two." },
    { icon: "zap", tone: "green", kicker: "3", title: "Third point", text: "Explain it in a sentence or two." },
  ],
};

export const DEFAULT_CHECKLIST: DiscoverChecklistAttrs = {
  icon: "rocket",
  tone: "purple",
  title: "Put it into action",
  items: ["First step", "Second step", "Third step"],
  layout: "full",
};

/** A full example in the house style, so editors start from a finished layout. */
export const FRAMEWORK_TEMPLATE = [
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Open with two or three sentences on why this matters and who it helps — a team, a customer, or a friend.",
      },
    ],
    attrs: { width: "1/2" },
  },
  {
    type: "discoverCallout",
    attrs: {
      icon: "target",
      tone: "purple",
      title: "The idea in one line",
      text: "The everyday behaviors that build trust, create momentum, and leave a lasting impression.",
      layout: "full",
      width: "1/2",
    },
  },
  {
    type: "discoverCards",
    attrs: {
      cards: [
        { icon: "users", tone: "purple", kicker: "F", title: "Friendliness", text: "Lead with a warm, respectful, and approachable attitude." },
        { icon: "target", tone: "blue", kicker: "A", title: "Accuracy", text: "Be dependable and get the details right." },
        { icon: "zap", tone: "green", kicker: "S", title: "Speedy", text: "Be responsive and keep things moving." },
        { icon: "heart", tone: "orange", kicker: "T", title: "Thankful", text: "Show genuine appreciation for people and their time." },
      ],
    },
  },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Why it works" }] },
  {
    type: "paragraph",
    attrs: { width: "1/2" },
    content: [{ type: "text", text: "Explain the result: stronger connections, less friction, and a culture of trust." }],
  },
  {
    type: "discoverChecklist",
    attrs: {
      icon: "rocket",
      tone: "purple",
      title: "Putting it into action",
      items: [
        "Greet people with a positive and open attitude.",
        "Be thorough and double-check your work.",
        "Respond promptly and keep things moving.",
        "Look for opportunities to say thank you.",
      ],
      layout: "full",
      width: "1/2",
    },
  },
];
