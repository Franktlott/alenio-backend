import type { BriefingStatus } from "../lib/api";

export function briefingStatusLabel(status: BriefingStatus): string {
  if (status === "reviewed") return "Completed";
  if (status === "overdue") return "Overdue";
  return "Not Started";
}

export function briefingStatusLabelUpper(status: BriefingStatus): string {
  return briefingStatusLabel(status).toUpperCase();
}

export function briefingStatusBadgeClass(status: BriefingStatus): string {
  if (status === "reviewed") return "briefing-badge briefing-badge--reviewed";
  if (status === "overdue") return "briefing-badge briefing-badge--overdue";
  return "briefing-badge briefing-badge--pending";
}

export function formatBriefingDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Local calendar date for `<input type="date">` from a briefing due-at ISO string. */
export function briefingDueDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatBriefingPublishedLabel(iso: string): string {
  const published = new Date(iso);
  if (isSameCalendarDay(published, new Date())) return "Published Today";
  return `Published ${formatBriefingDate(iso)}`;
}

/** Briefings show a "New" badge for this many days after publish. */
export const BRIEFING_NEW_BADGE_DAYS = 3;

export function isBriefingWithinNewBadgeWindow(
  publishedAt: string,
  now: Date = new Date(),
): boolean {
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return false;
  const ageMs = now.getTime() - published.getTime();
  if (ageMs < 0) return false;
  return ageMs < BRIEFING_NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
}

export function estimateBriefingReadMinutes(description: string): number {
  const words = description.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.min(10, Math.ceil(words / 200) || 1));
}

export function briefingRequiresInitialsLabel(
  allowInitials: boolean,
  requireSignature: boolean,
): string {
  if (requireSignature) return "Requires signature";
  if (allowInitials) return "Requires initials";
  return "Review required";
}

export function formatBriefingDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function briefingConsoleStatusLabel(status: BriefingStatus): string {
  if (status === "overdue") return "OVERDUE";
  if (status === "reviewed") return "COMPLETED";
  return "NOT STARTED";
}

export function briefingIconTone(title: string): "doc" | "shield" | "megaphone" | "alert" {
  const t = title.toLowerCase();
  if (t.includes("policy") || t.includes("safety") || t.includes("security")) return "shield";
  if (t.includes("alert") || t.includes("urgent")) return "alert";
  if (t.includes("update") || t.includes("announce")) return "megaphone";
  return "doc";
}

export function isPdfBriefing(contentType: string | null, url: string): boolean {
  if (contentType?.includes("pdf")) return true;
  return url.toLowerCase().includes(".pdf");
}

export function isImageBriefing(contentType: string | null, url: string): boolean {
  if (contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
}
