export const VIDEO_MEETING_DURATION_STEP_MINUTES = 15;
export const VIDEO_MEETING_MIN_DURATION_MINUTES = 15;
export const VIDEO_MEETING_MAX_DURATION_MINUTES = 120;

export const VIDEO_MEETING_DURATION_OPTIONS: number[] = Array.from(
  { length: VIDEO_MEETING_MAX_DURATION_MINUTES / VIDEO_MEETING_DURATION_STEP_MINUTES },
  (_, index) => (index + 1) * VIDEO_MEETING_DURATION_STEP_MINUTES,
);

export function formatVideoMeetingDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
  return `${hourLabel} ${remainder} min`;
}

export function addMinutesToDate(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function isAllowedVideoMeetingDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= VIDEO_MEETING_MIN_DURATION_MINUTES &&
    minutes <= VIDEO_MEETING_MAX_DURATION_MINUTES &&
    minutes % VIDEO_MEETING_DURATION_STEP_MINUTES === 0
  );
}

export function durationMinutesFromRange(start: Date, end: Date): number {
  const diffMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const stepped =
    Math.round(diffMinutes / VIDEO_MEETING_DURATION_STEP_MINUTES) * VIDEO_MEETING_DURATION_STEP_MINUTES;
  return Math.min(
    VIDEO_MEETING_MAX_DURATION_MINUTES,
    Math.max(VIDEO_MEETING_MIN_DURATION_MINUTES, stepped),
  );
}

export function validateVideoMeetingSchedule(start: Date, end: Date | null | undefined): string | null {
  if (!end) return "Video meetings need an end time.";
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Invalid meeting time.";
  if (end <= start) return "End time must be after the start time.";
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (durationMinutes < VIDEO_MEETING_MIN_DURATION_MINUTES) {
    return `Video meetings must be at least ${VIDEO_MEETING_MIN_DURATION_MINUTES} minutes.`;
  }
  if (durationMinutes > VIDEO_MEETING_MAX_DURATION_MINUTES) {
    return "Video meetings cannot be longer than 2 hours.";
  }
  if (!isAllowedVideoMeetingDuration(durationMinutes)) {
    return "Video meeting length must be in 15-minute steps.";
  }
  return null;
}

export function videoMeetingEndFromDuration(start: Date, durationMinutes: number): Date {
  if (!isAllowedVideoMeetingDuration(durationMinutes)) {
    throw new Error("Invalid video meeting duration");
  }
  return addMinutesToDate(start, durationMinutes);
}
