import type { TempProgramStatus, TempProgramValidation } from "./api";

export function formatTempProgramSaveError(err: unknown): string {
  if (!(err instanceof Error)) return "Could not save. Please try again.";
  const raw = err.message.trim();
  if (raw.includes("PROGRAM_LOCKED")) return "This program version is locked. Create a new draft version to edit.";
  if (raw.includes("VALIDATION_ERROR")) return "Fix validation issues before continuing.";
  if (raw.includes("DB_NOT_READY") || raw.includes("database tables are not set up")) {
    return "Temperature program tables are still setting up. Wait a moment, refresh, and try again.";
  }
  if (
    raw.includes("Not found") ||
    raw.includes("404") ||
    raw === "Request failed (404)"
  ) {
    return "Temperature programs are not available on the server yet. Deploy the latest backend, then refresh and try again.";
  }
  if (raw.includes("Forbidden") || raw.includes("FORBIDDEN")) {
    return "You don't have permission to manage temperature programs in this workspace.";
  }
  return raw || "Could not save. Please try again.";
}

export function tempProgramStatusLabel(status: TempProgramStatus): string {
  if (status === "active") return "Active";
  if (status === "archived") return "Archived";
  return "Draft";
}

export function tempProgramStatusClass(status: TempProgramStatus): string {
  if (status === "active") return "temp-prog-pill temp-prog-pill--active";
  if (status === "archived") return "temp-prog-pill temp-prog-pill--archived";
  return "temp-prog-pill temp-prog-pill--draft";
}

export function formatTempRange(min: number | null, max: number | null, unit: string): string {
  if (min != null && max != null) return `${min}–${max}°${unit}`;
  if (min != null) return `≥ ${min}°${unit}`;
  if (max != null) return `≤ ${max}°${unit}`;
  return "No range set";
}

export function formatScheduleSummary(schedule: {
  scheduleType: string;
  specificTimes: unknown;
  intervalHours: number | null;
  timezone: string | null;
}): string {
  if (schedule.scheduleType === "specific_times") {
    const times = Array.isArray(schedule.specificTimes) ? schedule.specificTimes.join(", ") : "";
    return times ? `At ${times}` : "Specific times";
  }
  if (schedule.scheduleType === "interval" && schedule.intervalHours) {
    return `Every ${schedule.intervalHours} hours`;
  }
  if (schedule.scheduleType === "opening") return "At opening";
  if (schedule.scheduleType === "closing") return "At closing";
  return schedule.scheduleType;
}

export function canEditTempProgram(program: { status: TempProgramStatus; isLocked: boolean }): boolean {
  return program.status === "draft" && !program.isLocked;
}

export function validationSummary(validation: TempProgramValidation): string {
  if (validation.isValid) return "Ready to activate";
  return `${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"} to fix`;
}

export const CHECK_TYPE_OPTIONS = [
  { value: "hot_holding", label: "Hot holding" },
  { value: "cold_holding", label: "Cold holding" },
  { value: "freezer", label: "Freezer" },
  { value: "product", label: "Product" },
  { value: "water_bottle", label: "Water bottle" },
  { value: "equipment_surface", label: "Equipment surface" },
] as const;

export const SCHEDULE_TYPE_OPTIONS = [
  { value: "specific_times", label: "Specific times" },
  { value: "interval", label: "Interval" },
  { value: "opening", label: "Opening" },
  { value: "closing", label: "Closing" },
] as const;

export const ASSIGNMENT_TYPE_OPTIONS = [
  { value: "company", label: "Company" },
  { value: "region", label: "Region" },
  { value: "district", label: "District" },
  { value: "workplace", label: "Workplace" },
] as const;

export const CORRECTIVE_ACTION_OPTIONS = [
  { value: "reheat_product", label: "Reheat product" },
  { value: "discard_product", label: "Discard product" },
  { value: "move_product", label: "Move product" },
  { value: "call_manager", label: "Call manager" },
  { value: "maintenance_ticket", label: "Maintenance ticket" },
  { value: "retake_temperature", label: "Retake temperature" },
  { value: "other", label: "Other" },
] as const;

export const CONDITION_TYPE_OPTIONS = [
  { value: "below_min", label: "Below minimum" },
  { value: "above_max", label: "Above maximum" },
  { value: "no_reading", label: "No reading" },
  { value: "equipment_unavailable", label: "Equipment unavailable" },
] as const;
