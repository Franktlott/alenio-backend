import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createVideoRoom, fetchUpcomingVideoMeetings, type WebMeUser } from "../lib/api";
import { formatMeetingCountdown } from "../lib/format-meeting-countdown";
import { queryKeys } from "../lib/query-keys";
import {
  canShowVideoJoin,
  isInVideoMeetingBannerWindow,
  isVideoMeetingLeaderRole,
} from "../lib/video-meeting-join";

type Props = {
  selectedTeamId: string;
  user: WebMeUser | null;
};

export function VideoMeetingTopBarJoin({ selectedTeamId, user }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const meetingsQuery = useQuery({
    queryKey: queryKeys.upcomingVideoMeetings,
    queryFn: fetchUpcomingVideoMeetings,
    enabled: !!user,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const activeMeeting = useMemo(() => {
    if (!selectedTeamId) return null;
    return (
      (meetingsQuery.data ?? [])
        .filter((m) => m.event.teamId === selectedTeamId)
        .find((m) => isInVideoMeetingBannerWindow(m.event.startDate, m.event.endDate, now)) ?? null
    );
  }, [meetingsQuery.data, selectedTeamId, now]);

  if (!activeMeeting) return null;

  const { event, userRole } = activeMeeting;
  const startMs = new Date(event.startDate).getTime();
  const msUntilStart = startMs - now;
  const hasStarted = msUntilStart <= 0;
  const showJoin = canShowVideoJoin(
    event.startDate,
    event.endDate,
    now,
    isVideoMeetingLeaderRole(userRole),
  );
  const isLive = hasStarted && showJoin;

  const handleJoin = async () => {
    setJoinError(null);
    setJoinLoading(true);
    try {
      const room = await createVideoRoom(event.id, user?.name ?? user?.email ?? "Guest");
      if (!room.token) throw new Error("Could not start video call.");
      const call = `${room.url}?t=${encodeURIComponent(room.token)}&prejoin=false`;
      setVideoTitle(event.title);
      setVideoUrl(call);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not start video call.");
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <>
      <div className="enterprise-meeting-join-wrap">
        <div
          className={`enterprise-meeting-join${isLive ? " enterprise-meeting-join--live" : ""}${showJoin ? " enterprise-meeting-join--ready" : ""}`}
          role="status"
          data-testid="video-meeting-topbar-join"
        >
          <span className="enterprise-meeting-join-live" aria-hidden />
          <div className="enterprise-meeting-join-copy">
            <span className="enterprise-meeting-join-status">
              {hasStarted ? "In progress" : "Upcoming meeting"}
            </span>
            <span className="enterprise-meeting-join-title" title={event.title}>
              {event.title}
            </span>
          </div>
          {showJoin ? (
            <button
              type="button"
              className="enterprise-meeting-join-btn"
              onClick={() => void handleJoin()}
              disabled={joinLoading}
              data-testid="video-meeting-join-button"
            >
              {joinLoading ? "Joining…" : "Join"}
            </button>
          ) : (
            <span className="enterprise-meeting-join-countdown" aria-live="polite">
              {formatMeetingCountdown(msUntilStart)}
            </span>
          )}
        </div>
        {joinError ? (
          <p className="enterprise-meeting-join-error" role="alert">
            {joinError}
          </p>
        ) : null}
      </div>
      {videoUrl ? (
        <div className="enterprise-task-modal-backdrop" role="presentation" onClick={() => setVideoUrl(null)}>
          <div className="enterprise-video-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="enterprise-task-modal-close"
              onClick={() => setVideoUrl(null)}
              aria-label="Close video call"
            >
              ×
            </button>
            <h3 className="enterprise-card-title">{videoTitle || "Video call"}</h3>
            <iframe
              src={videoUrl}
              className="enterprise-video-iframe"
              allow="camera; microphone; fullscreen; display-capture"
              title={videoTitle || "Video call"}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
