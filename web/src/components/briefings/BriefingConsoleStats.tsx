import { useEffect, useState } from "react";

type Props = {
  deviceCount: number;
  memberCount: number;
  lastSyncMs: number;
};

function syncLabel(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"} ago`;
  const min = Math.floor(sec / 60);
  return `${min} minute${min === 1 ? "" : "s"} ago`;
}

export function BriefingConsoleStats({ deviceCount, memberCount, lastSyncMs }: Props) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="briefing-console-stats" data-testid="briefing-console-stats">
      <div className="briefing-console-stat">
        <span className="briefing-console-stat-label">Workplace Online</span>
        <strong className="briefing-console-stat-value briefing-console-stat-value--green">All systems normal</strong>
      </div>
      <div className="briefing-console-stat">
        <span className="briefing-console-stat-label">{deviceCount} Devices Connected</span>
        <strong className="briefing-console-stat-value">{deviceCount > 0 ? "All online" : "No devices linked"}</strong>
      </div>
      <div className="briefing-console-stat">
        <span className="briefing-console-stat-label">{memberCount} Associates</span>
        <strong className="briefing-console-stat-value">Active in this workplace</strong>
      </div>
      <div className="briefing-console-stat">
        <span className="briefing-console-stat-label">Last Sync</span>
        <strong className="briefing-console-stat-value">{syncLabel(lastSyncMs)}</strong>
      </div>
    </div>
  );
}
