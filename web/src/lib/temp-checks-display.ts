import type { TempCheckTemplateRow } from "./api";

export function formatTempCheckTime(value: string): string {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatTempRange(tempMinF: number | null, tempMaxF: number | null): string {
  if (tempMinF != null && tempMaxF != null) return `${tempMinF}°F – ${tempMaxF}°F`;
  if (tempMinF != null) return `≥ ${tempMinF}°F`;
  if (tempMaxF != null) return `≤ ${tempMaxF}°F`;
  return "Any temperature";
}

export function formatTempCheckWindow(template: Pick<TempCheckTemplateRow, "windowStartLocal" | "windowEndLocal">): string {
  return `${formatTempCheckTime(template.windowStartLocal)} – ${formatTempCheckTime(template.windowEndLocal)}`;
}

export function formatTempCheckSchedule(template: Pick<TempCheckTemplateRow, "dueTimeLocal" | "windowStartLocal" | "windowEndLocal">): string {
  return `Due ${formatTempCheckTime(template.dueTimeLocal)} · Window ${formatTempCheckWindow(template)}`;
}

export function formatTempCheckSaveError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Could not save temp check. Please review the form and try again.";
}

function localTimeToMinutes(value: string): number {
  const [hourRaw, minuteRaw] = value.split(":");
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

export function isTempCheckWindowOpen(
  template: Pick<TempCheckTemplateRow, "windowStartLocal" | "windowEndLocal">,
  at = new Date(),
): boolean {
  const nowMinutes = at.getHours() * 60 + at.getMinutes();
  const start = localTimeToMinutes(template.windowStartLocal);
  const end = localTimeToMinutes(template.windowEndLocal);
  if (start <= end) return nowMinutes >= start && nowMinutes <= end;
  return nowMinutes >= start || nowMinutes <= end;
}

export function formatTempCheckDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isReadingInTempRange(readingF: number, tempMinF: number | null, tempMaxF: number | null): boolean {
  if (tempMinF != null && readingF < tempMinF) return false;
  if (tempMaxF != null && readingF > tempMaxF) return false;
  return true;
}
