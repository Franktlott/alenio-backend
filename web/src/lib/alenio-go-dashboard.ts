export type GoDashModule = {
  id: string;
  title: string;
  subtitle: string;
  active: boolean;
  href?: string;
  tone: "indigo" | "cyan" | "violet" | "amber" | "emerald";
  icon: "tasks" | "checklists" | "walks" | "briefings" | "temp";
  count?: number | null;
  countMessage?: string;
  ctaLabel?: string;
};

export type GoDashQuickAction = {
  id: string;
  label: string;
  active: boolean;
  tone: "indigo" | "emerald" | "violet" | "amber" | "slate";
  icon: "camera" | "note" | "temp" | "history" | "more";
  href?: string;
};

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function formatGoDashClock(now = new Date()): { time: string; date: string } {
  return {
    time: now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    date: now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
  };
}

export function formatGoDashHeaderDate(now = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function shiftLabelForHour(hour: number): string {
  if (hour >= 5 && hour < 14) return "1st Shift";
  if (hour >= 14 && hour < 22) return "2nd Shift";
  return "3rd Shift";
}

export const GO_DASH_KIOSK_MODULES: GoDashModule[] = [
  {
    id: "briefings",
    title: "Briefings",
    subtitle: "Review & initial",
    active: true,
    tone: "amber",
    icon: "briefings",
    ctaLabel: "View briefings",
    countMessage: "Nothing pending",
  },
  {
    id: "checklists",
    title: "Checklists",
    subtitle: "Daily checklists",
    active: false,
    tone: "cyan",
    icon: "checklists",
    ctaLabel: "View checklists",
    countMessage: "Coming soon",
  },
  {
    id: "temp-checks",
    title: "Temp checks",
    subtitle: "Food safety logs",
    active: true,
    tone: "emerald",
    icon: "temp",
    ctaLabel: "Open temp checks",
    countMessage: "Complete scheduled readings",
  },
  {
    id: "walks",
    title: "Walks",
    subtitle: "Manager observations",
    active: true,
    tone: "violet",
    icon: "walks",
    ctaLabel: "Open walks",
    countMessage: "Complete published walks",
  },
  {
    id: "tasks",
    title: "Tasks",
    subtitle: "Requires Alenio account",
    active: false,
    tone: "indigo",
    icon: "tasks",
    ctaLabel: "View tasks",
    countMessage: "Coming soon",
  },
];

/** @deprecated Use GO_DASH_KIOSK_MODULES */
export const GO_DASH_INACTIVE_MODULES = GO_DASH_KIOSK_MODULES.slice(2);

export const GO_DASH_QUICK_ACTIONS: GoDashQuickAction[] = [
  { id: "photo", label: "Add Photo", active: false, tone: "indigo", icon: "camera" },
  { id: "note", label: "Add Note", active: false, tone: "emerald", icon: "note" },
  { id: "temp", label: "Temp Check", active: false, tone: "violet", icon: "temp" },
  { id: "history", label: "View History", active: false, tone: "amber", icon: "history" },
  { id: "more", label: "More", active: false, tone: "slate", icon: "more" },
];
