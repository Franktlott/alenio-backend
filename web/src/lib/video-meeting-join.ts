/** Owner or team leader — early join window on video meetings (matches mobile MeetingBanner). */
export function isVideoMeetingLeaderRole(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

/**
 * Whether to show a Join control for a video meeting.
 * Matches mobile MeetingBanner + calendar: banner window is 15m before start until end;
 * leaders may join any time in that window; members from 5m before start (or after).
 */
export function canShowVideoJoin(
  startDate: string,
  endDate: string | null | undefined,
  nowMs: number,
  isOwnerOrLeader: boolean,
): boolean {
  const startMs = new Date(startDate).getTime();
  const endMs = endDate ? new Date(endDate).getTime() : startMs + 60 * 60 * 1000;
  const msUntilStart = startMs - nowMs;
  if (nowMs >= endMs || msUntilStart > 15 * 60 * 1000) return false;
  return isOwnerOrLeader || msUntilStart <= 5 * 60 * 1000;
}

/** Whether an upcoming-meeting banner should be visible (mobile MeetingBanner window). */
export function isInVideoMeetingBannerWindow(
  startDate: string,
  endDate: string | null | undefined,
  nowMs: number,
): boolean {
  const startMs = new Date(startDate).getTime();
  const endMs = endDate ? new Date(endDate).getTime() : startMs + 60 * 60 * 1000;
  const msUntilStart = startMs - nowMs;
  return msUntilStart <= 15 * 60 * 1000 && nowMs < endMs;
}
