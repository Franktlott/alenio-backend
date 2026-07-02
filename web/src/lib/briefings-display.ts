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
