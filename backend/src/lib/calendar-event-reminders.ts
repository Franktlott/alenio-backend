const pendingReminders = new Map<string, ReturnType<typeof setTimeout>[]>();

export function cancelPendingCalendarEventReminders(eventId: string) {
  const handles = pendingReminders.get(eventId);
  if (handles) {
    handles.forEach((t) => clearTimeout(t));
    pendingReminders.delete(eventId);
  }
}

export function storePendingCalendarEventReminders(
  eventId: string,
  handles: ReturnType<typeof setTimeout>[],
) {
  cancelPendingCalendarEventReminders(eventId);
  if (handles.length > 0) {
    pendingReminders.set(eventId, handles);
  }
}

export function getPendingCalendarEventReminders(eventId: string) {
  return pendingReminders.get(eventId);
}
