export function formatMeetingCountdown(msUntilStart: number): string {
  if (msUntilStart <= 0) return "Starting now";
  const totalSeconds = Math.floor(msUntilStart / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds < 10 ? "0" : ""}${seconds}s`;
}
