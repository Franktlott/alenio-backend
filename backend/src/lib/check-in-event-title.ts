export const CHECK_IN_EVENT_PREFIX = "Check-in —";
export const LEGACY_ONE_ON_ONE_EVENT_PREFIX = "1:1 —";

export function checkInEventTitle(memberName: string): string {
  const trimmed = memberName.trim();
  return trimmed ? `${CHECK_IN_EVENT_PREFIX} ${trimmed}` : "Check-in";
}

/** Titles used when matching legacy planned calendar events for a member. */
export function plannedCheckInTitlesForMember(memberName: string): string[] {
  const trimmed = memberName.trim();
  if (!trimmed) return ["Check-in", "1:1 check-in"];
  return [
    `${CHECK_IN_EVENT_PREFIX} ${trimmed}`,
    `${LEGACY_ONE_ON_ONE_EVENT_PREFIX} ${trimmed}`,
  ];
}

export const PLANNED_CHECK_IN_TITLE_PREFIXES = [CHECK_IN_EVENT_PREFIX, LEGACY_ONE_ON_ONE_EVENT_PREFIX] as const;
