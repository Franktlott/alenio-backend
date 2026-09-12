export function parseCalendarAssignees(reminderMinutes: string | null | undefined): string[] {
  if (!reminderMinutes) return [];
  try {
    const parsed = JSON.parse(reminderMinutes) as unknown;
    if (Array.isArray(parsed)) return [];
    if (!parsed || typeof parsed !== "object") return [];
    const ids = (parsed as { assigneeIds?: unknown }).assigneeIds;
    if (!Array.isArray(ids)) return [];
    return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}
