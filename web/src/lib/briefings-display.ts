import type { BriefingStatus } from "../lib/api";

export function briefingStatusLabel(status: BriefingStatus): string {
  if (status === "reviewed") return "Reviewed";
  if (status === "overdue") return "Overdue";
  return "Not Started";
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

export function isPdfBriefing(contentType: string | null, url: string): boolean {
  if (contentType?.includes("pdf")) return true;
  return url.toLowerCase().includes(".pdf");
}

export function isImageBriefing(contentType: string | null, url: string): boolean {
  if (contentType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
}
