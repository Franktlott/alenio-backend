export type MeetingCheckInEligiblePair = {
  workspace: { id: string; name: string };
  member: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

export type MeetingCheckInContext = {
  sourceVideoRoomId: string;
  roomKind: "calendar" | "dm" | "group" | "team";
  calendarEventId: string | null;
  eligiblePairs: MeetingCheckInEligiblePair[];
};

/**
 * The person and form chosen before live notes start, so hang-up writes up
 * into that check-in instead of guessing an open one.
 */
export type LiveNotesSession = {
  pair: MeetingCheckInEligiblePair;
  templateId: string | null;
  templateTitle: string;
  questions: string[];
};

export function checkInQuestionLabels(
  fields: { type: string; order: number; label: string }[],
): string[] {
  return fields
    .filter((field) => field.type !== "section" && field.type !== "manager_notes")
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((field) => field.label);
}

export function activeMeetingCheckInPairs(
  context: MeetingCheckInContext | null,
  activeParticipantUserIds: string[],
): MeetingCheckInEligiblePair[] {
  const activeIds = new Set(activeParticipantUserIds);
  return (context?.eligiblePairs ?? []).filter((pair) =>
    activeIds.has(pair.member.id),
  );
}

export function uniqueMeetingCheckInMembers(
  pairs: MeetingCheckInEligiblePair[],
): MeetingCheckInEligiblePair[] {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    if (seen.has(pair.member.id)) return false;
    seen.add(pair.member.id);
    return true;
  });
}

export function meetingCheckInWorkspacesForMember(
  pairs: MeetingCheckInEligiblePair[],
  memberUserId: string | null,
): MeetingCheckInEligiblePair[] {
  return memberUserId
    ? pairs.filter((pair) => pair.member.id === memberUserId)
    : [];
}
