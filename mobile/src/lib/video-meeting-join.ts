const DEFAULT_MEETING_MS = 60 * 60 * 1000;
const BANNER_JOIN_MS = 15 * 60 * 1000;

function instantMs(value: string | Date | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  return Date.parse(value);
}

/** Owner or team leader — early join window on video meetings (matches MeetingBanner). */
export function isVideoMeetingLeaderRole(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

export function videoMeetingEffectiveEndMs(
  startDate: string | Date | number | null | undefined,
  endDate: string | Date | number | null | undefined,
): number {
  const startMs = instantMs(startDate);
  const parsedEnd = instantMs(endDate);
  if (!Number.isFinite(startMs)) return Number.NaN;
  if (Number.isFinite(parsedEnd) && parsedEnd > startMs) return parsedEnd;
  return startMs + DEFAULT_MEETING_MS;
}

/**
 * Day-list Join matches the banner: 15 minutes before start until the meeting ends.
 * A 1:21 AM call at 1:20 AM shows Join; an 11:49 PM call earlier that morning does not.
 */
export function canShowAgendaVideoJoin(
  startDate: string | Date | number | null | undefined,
  endDate: string | Date | number | null | undefined,
  nowMs: number,
): boolean {
  return isInVideoMeetingBannerWindow(startDate, endDate, nowMs);
}

/**
 * Whether to show a Join control for a video meeting.
 * Banner window is 15m before start until end; leaders may join any time in that
 * window; members from 5m before start (or after start) until end.
 */
export function canShowVideoJoin(
  startDate: string,
  endDate: string | null | undefined,
  nowMs: number,
  isOwnerOrLeader: boolean,
): boolean {
  const startMs = instantMs(startDate);
  const endMs = videoMeetingEffectiveEndMs(startDate, endDate);
  const msUntilStart = startMs - nowMs;
  if (!Number.isFinite(startMs) || nowMs >= endMs || msUntilStart > BANNER_JOIN_MS) {
    return false;
  }
  return isOwnerOrLeader || msUntilStart <= 5 * 60 * 1000;
}

/** Whether the meeting banner should consider this event (15m before start until end). */
export function isInVideoMeetingBannerWindow(
  startDate: string | Date | number | null | undefined,
  endDate: string | Date | number | null | undefined,
  nowMs: number,
): boolean {
  const startMs = instantMs(startDate);
  const endMs = videoMeetingEffectiveEndMs(startDate, endDate);
  const msUntilStart = startMs - nowMs;
  return Number.isFinite(startMs) && msUntilStart <= BANNER_JOIN_MS && nowMs < endMs;
}

type BannerMeetingLike = {
  event: { id: string; startDate: string; endDate?: string | null };
};

/**
 * Eligible banner meetings, live first then soonest start.
 * Keeps one primary meeting instead of whichever was inserted first.
 */
export function rankMeetingsForBanner<T extends BannerMeetingLike>(
  meetings: T[],
  nowMs: number,
  dismissedIds: readonly string[] = [],
): T[] {
  const dismissed = new Set(dismissedIds);
  return meetings
    .filter(
      (meeting) =>
        !dismissed.has(meeting.event.id) &&
        isInVideoMeetingBannerWindow(
          meeting.event.startDate,
          meeting.event.endDate,
          nowMs,
        ),
    )
    .sort((a, b) => {
      const aStart = new Date(a.event.startDate).getTime();
      const bStart = new Date(b.event.startDate).getTime();
      const aLive = aStart <= nowMs;
      const bLive = bStart <= nowMs;
      if (aLive !== bLive) return aLive ? -1 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return a.event.id.localeCompare(b.event.id);
    });
}

/** Strict meeting window: start ≤ now < end (no early join). */
export function isWithinMeetingTimeFrame(
  startDate: string,
  endDate: string | null | undefined,
  nowMs: number,
): boolean {
  const startMs = instantMs(startDate);
  const endMs = videoMeetingEffectiveEndMs(startDate, endDate);
  return Number.isFinite(startMs) && nowMs >= startMs && nowMs < endMs;
}
