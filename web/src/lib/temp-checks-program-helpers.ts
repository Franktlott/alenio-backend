import type { TempCheckTemplateRow } from "./api";
import { formatTempCheckTime } from "./temp-checks-display";

export type ProgramIconTone = "sun" | "lunch" | "dinner" | "hot" | "cooler" | "default";

export function inferProgramIcon(name: string): ProgramIconTone {
  const n = name.toLowerCase();
  if (n.includes("morning") || n.includes("opening") || n.includes("am")) return "sun";
  if (n.includes("lunch") || n.includes("midday")) return "lunch";
  if (n.includes("dinner") || n.includes("evening") || n.includes("closing")) return "dinner";
  if (n.includes("hot") || n.includes("holding")) return "hot";
  if (n.includes("cooler") || n.includes("freezer") || n.includes("cold")) return "cooler";
  return "default";
}

export function programStatusDotClass(tone: ProgramIconTone): string {
  const map: Record<ProgramIconTone, string> = {
    sun: "tc-prog-dot--green",
    lunch: "tc-prog-dot--blue",
    dinner: "tc-prog-dot--purple",
    hot: "tc-prog-dot--orange",
    cooler: "tc-prog-dot--cyan",
    default: "tc-prog-dot--slate",
  };
  return map[tone];
}

function localTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatWindowDuration(windowStartLocal: string, windowEndLocal: string): string {
  const start = localTimeToMinutes(windowStartLocal);
  const end = localTimeToMinutes(windowEndLocal);
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  const hours = diff / 60;
  if (hours >= 1 && Math.abs(hours - Math.round(hours)) < 0.05) {
    const rounded = Math.round(hours);
    return `${rounded} Hour${rounded === 1 ? "" : "s"}`;
  }
  return `${Math.round(diff)} min`;
}

export function computeProgramKpis(templates: TempCheckTemplateRow[]) {
  const activePrograms = templates.length;
  const totalTempItems = templates.reduce((sum, t) => sum + t.itemCount, 0);
  const sorted = [...templates].sort((a, b) => localTimeToMinutes(a.dueTimeLocal) - localTimeToMinutes(b.dueTimeLocal));
  const next = sorted[0] ?? null;
  return {
    activePrograms,
    totalTempItems,
    nextDueTime: next ? formatTempCheckTime(next.dueTimeLocal) : "—",
    nextDueLabel: next?.name ?? "No programs yet",
  };
}

export function inferItemCategory(label: string): string {
  const n = label.toLowerCase();
  if (n.includes("freezer")) return "Frozen Storage";
  if (n.includes("hot") || n.includes("steam")) return "Hot Holding";
  if (n.includes("walk") || n.includes("cooler") || n.includes("fridge") || n.includes("rss") || n.includes("ows")) {
    return "Refrigerated Storage";
  }
  return "Temperature probe point";
}
