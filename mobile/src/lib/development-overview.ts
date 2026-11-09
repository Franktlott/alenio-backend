import type { CalendarEvent, TeamMember } from "@/lib/types";
import { memberDevelopmentStatus } from "@/lib/member-development-preview";
import type {
  MemberStatsRow,
  WorkplaceStandards,
} from "@/lib/workplace-standards";

const STATUS_RANK = {
  needs_attention: 0,
  due_soon: 1,
  unavailable: 2,
  on_track: 3,
  // Last: nobody is waiting on them, so they are the least worth looking at.
  not_required: 4,
} as const;

export function selectUpcomingDevelopmentCheckIns(
  events: CalendarEvent[],
  now = new Date(),
): CalendarEvent[] {
  const nowMs = now.getTime();
  return events
    .filter((event) => {
      if (!event.isOneOnOne) return false;
      const endMs = new Date(event.endDate ?? event.startDate).getTime();
      return Number.isFinite(endMs) && endMs >= nowMs;
    })
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
}

export function nextCheckInByMember(
  events: CalendarEvent[],
  now = new Date(),
): Map<string, CalendarEvent> {
  const result = new Map<string, CalendarEvent>();
  for (const event of selectUpcomingDevelopmentCheckIns(events, now)) {
    const memberUserId =
      event.oneOnOneMemberUserId ?? event.assigneeIds?.[0] ?? null;
    if (memberUserId && !result.has(memberUserId)) {
      result.set(memberUserId, event);
    }
  }
  return result;
}

export function sortDevelopmentMembers(
  members: TeamMember[],
  memberStats: Record<string, MemberStatsRow> | undefined,
  standards: WorkplaceStandards,
): TeamMember[] {
  return members
    .map((member, index) => ({
      member,
      index,
      rank:
        STATUS_RANK[
          memberDevelopmentStatus(memberStats?.[member.userId], standards).level
        ],
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ member }) => member);
}
