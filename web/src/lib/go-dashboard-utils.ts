import type { ChecklistLocationItemRow, ChecklistLocationRow, ChecklistSubmissionRow } from "./api";
import { checklistCardColorStyles } from "./checklist-card-colors";

export type ChecklistCardMeta = {
  icon: string;
  iconBg: string;
  area: string;
  frequency: string;
};

export function checklistCardMeta(checklist: ChecklistLocationRow): ChecklistCardMeta {
  const colorStyles = checklistCardColorStyles(checklist.cardColor);
  const blob = `${checklist.name} ${checklist.items.map((i) => `${i.category ?? ""} ${i.title}`).join(" ")}`.toLowerCase();
  let icon = "📋";
  let iconBg = colorStyles.iconBg;
  if (/beverage|drink|coffee|barista/.test(blob)) {
    icon = "☕";
  } else if (/food|kitchen|grill|service/.test(blob)) {
    icon = "🌭";
  } else if (/register|pos|cash|shift check/.test(blob)) {
    icon = "🧾";
  } else if (/restroom|bathroom|walk/.test(blob)) {
    icon = "🚻";
  }

  const area = checklist.description?.trim().split(/\n/)[0]?.slice(0, 48) || primaryCategory(checklist.items) || "General";
  let frequency = "Every shift";
  if (/opening|open|morning|daily/.test(blob)) frequency = "Daily";
  else if (/closing|close|night|nightly/.test(blob)) frequency = "Nightly";

  return { icon, iconBg, area, frequency };
}

function primaryCategory(items: ChecklistLocationItemRow[]): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    const cat = item.category?.trim();
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [cat, count] of counts) {
    if (count > bestCount) {
      best = cat;
      bestCount = count;
    }
  }
  return best;
}

export function formatGoDate(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Never";
  }
}

export function formatGoTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function formatGoRelative(iso: string | null): string {
  if (!iso) return "Not seen recently";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return formatGoDate(iso);
}

export function isIpadRecentlyActive(lastAt: string | null, withinMs = 30 * 60_000): boolean {
  if (!lastAt) return false;
  return Date.now() - new Date(lastAt).getTime() < withinMs;
}

export function latestSubmissionAt(submissions: ChecklistSubmissionRow[]): string | null {
  if (!submissions.length) return null;
  return submissions.reduce((best, s) => (s.submittedAt > best ? s.submittedAt : best), submissions[0]!.submittedAt);
}

export function todaySubmissions(submissions: ChecklistSubmissionRow[]): ChecklistSubmissionRow[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return submissions.filter((s) => new Date(s.submittedAt) >= start);
}

export function storeCompletionPercent(submissions: ChecklistSubmissionRow[], checklistCount: number): number {
  if (checklistCount <= 0) return 0;
  const today = todaySubmissions(submissions);
  const completeToday = today.filter((s) => s.isComplete).length;
  return Math.min(100, Math.round((completeToday / checklistCount) * 100));
}

export function userInitials(name: string | null | undefined): string {
  const n = name?.trim() ?? "";
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}
