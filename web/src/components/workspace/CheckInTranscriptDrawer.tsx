import { useQuery } from "@tanstack/react-query";
import { AudioLines, Copy, FileAudio, Loader2, Pause, Play, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  deleteCheckInRecordingAudio,
  fetchCheckInRecordingAudio,
  fetchCheckInRecordingForMeeting,
  type CheckInAudioPart,
  type CheckInRecordingDetail,
} from "../../lib/member-development-api";
import "../../routes/discover/discover-categories-drawer.css";

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** The conversation transcript behind a recorded check-in. Leaders only, as on mobile. */
export function CheckInTranscriptDrawer({
  teamId,
  userId,
  meetingId,
  title,
  onClose,
}: {
  teamId: string;
  userId: string;
  meetingId: string | null;
  title?: string;
  onClose: () => void;
}) {
  const recording = useQuery({
    queryKey: ["workspace", "member", teamId, userId, "transcript", meetingId],
    queryFn: () => fetchCheckInRecordingForMeeting(teamId, userId, meetingId!),
    enabled: Boolean(meetingId),
    retry: false,
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!meetingId) return;
    setCopied(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [meetingId, onClose]);

  if (!meetingId) return null;
  const data = recording.data;
  const transcript = data?.transcript?.trim() ?? "";
  const segments = data?.transcriptSegments ?? [];

  function formatMs(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  return createPortal(
    <div className="dcat-layer ci-transcript-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="dcat-drawer wm-drawer ci-drawer" role="dialog" aria-modal="true" aria-label="Conversation transcript" data-testid="ci-transcript">
        <header className="dcat-head">
          <span className="dcat-head-icon">
            <FileAudio size={17} strokeWidth={2.3} />
          </span>
          <div className="dcat-head-copy">
            <h2>Transcript</h2>
            <p>{title ? `${title} · Leaders only.` : "Leaders on this check-in only."}</p>
          </div>
          <button type="button" className="dcat-close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        <div className="ci-scroll">
          {recording.isLoading ? (
            <p className="wm-muted ci-transcript-state">
              <Loader2 size={15} className="ci-spin" /> Loading transcript…
            </p>
          ) : recording.isError ? (
            <p className="wm-muted ci-transcript-state">
              {/not found/i.test(String((recording.error as Error)?.message))
                ? "There is no transcript saved for this check-in."
                : "We couldn't load the transcript."}
            </p>
          ) : data ? (
            <>
              <AudioSection teamId={teamId} userId={userId} recording={data} />
              {segments.length > 0 ? (
                <section className="ci-transcript">
                  <div className="ci-transcript-head">
                    <h4>{data.source === "video_call" ? "From the video call" : "From your recording"}</h4>
                    <button
                      type="button"
                      className="wm-link-btn"
                      onClick={() => {
                        const text = segments
                          .map((segment) => {
                            const stamp = formatMs(segment.startMs);
                            const who = segment.speakerLabel ? ` — ${segment.speakerLabel}` : "";
                            return `${stamp}${who}\n${segment.text}`;
                          })
                          .join("\n\n");
                        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
                      }}
                    >
                      <Copy size={12} strokeWidth={2.4} />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="ci-transcript-segments" data-testid="check-in-transcript-text">
                    {segments.map((segment) => (
                      <div key={segment.id} className="ci-transcript-segment">
                        <div className="ci-transcript-time">
                          {formatMs(segment.startMs)}
                          {segment.speakerLabel ? ` — ${segment.speakerLabel}` : ""}
                        </div>
                        <p className="ci-transcript-text">{segment.text}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : transcript ? (
                <section className="ci-transcript">
                  <div className="ci-transcript-head">
                    <h4>{data.source === "video_call" ? "From the video call" : "From your recording"}</h4>
                    <button
                      type="button"
                      className="wm-link-btn"
                      onClick={() => {
                        void navigator.clipboard?.writeText(transcript).then(() => setCopied(true));
                      }}
                    >
                      <Copy size={12} strokeWidth={2.4} />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="ci-transcript-text" data-testid="check-in-transcript-text">
                    {transcript}
                  </p>
                </section>
              ) : (
                <p className="wm-muted ci-transcript-state">There is no transcript saved for this check-in.</p>
              )}
            </>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

/**
 * The original audio. Only whoever recorded it can play it, and only until the
 * check-in is published or seven days pass. Once gone it becomes a status line.
 */
function AudioSection({ teamId, userId, recording }: { teamId: string; userId: string; recording: CheckInRecordingDetail }) {
  const [status, setStatus] = useState(recording.audioStatus);
  const [deletedByHand, setDeletedByHand] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const partsRef = useRef<CheckInAudioPart[]>([]);
  const partIndexRef = useRef(0);
  const beforePartRef = useRef(0);

  useEffect(() => setStatus(recording.audioStatus), [recording.audioStatus]);

  const teardown = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (!audio) return;
    audio.pause();
    audio.src = "";
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    teardown();
    partIndexRef.current = 0;
    beforePartRef.current = 0;
    setPlaying(false);
    setElapsed(0);
  }, [teardown]);

  const playPart = useCallback(
    (index: number) => {
      const part = partsRef.current[index];
      if (!part) {
        stop();
        return;
      }
      teardown();
      partIndexRef.current = index;
      const audio = new Audio(part.url);
      audioRef.current = audio;
      audio.ontimeupdate = () => setElapsed(beforePartRef.current + audio.currentTime);
      audio.onended = () => {
        beforePartRef.current += part.durationSec || audio.duration || 0;
        if (index + 1 < partsRef.current.length) playPart(index + 1);
        else stop();
      };
      audio.onerror = () => {
        setError("We couldn't play that recording.");
        stop();
      };
      void audio.play().catch(() => setError("Your browser blocked playback. Press play again."));
      setPlaying(true);
    },
    [stop, teardown],
  );

  const togglePlay = async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (audioRef.current) {
      void audioRef.current.play();
      setPlaying(true);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const playback = await fetchCheckInRecordingAudio(teamId, userId, recording.id);
      partsRef.current = playback.parts;
      beforePartRef.current = 0;
      if (playback.parts.length === 0) setStatus("deleted");
      else playPart(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't play that recording.";
      if (/deleted/i.test(message)) setStatus("deleted");
      else setError(message);
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete original recording? The audio cannot be recovered. The transcript, summary, and saved check-in will remain.")) return;
    stop();
    setError(null);
    setDeleting(true);
    try {
      await deleteCheckInRecordingAudio(teamId, userId, recording.id);
      partsRef.current = [];
      setDeletedByHand(true);
      setStatus("deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't delete that recording.");
    } finally {
      setDeleting(false);
    }
  };

  if (status === "pending" || status === "none") return null;

  if (status === "deleted" || status === "deleting" || status === "deletion_failed") {
    const neverKept = !recording.audioRetained && !deletedByHand;
    const reason = deletedByHand ? "manual" : recording.audioDeleteReason;
    return (
      <section className="ci-audio ci-audio--gone" data-testid="check-in-audio-deleted">
        <div className="ci-audio-head">
          <span>
            <AudioLines size={14} strokeWidth={2.3} />
          </span>
          <strong>{neverKept ? "No original recording saved" : "Original recording deleted"}</strong>
        </div>
        <p className="ci-audio-note">
          {neverKept
            ? "This check-in was recorded before Alenio kept audio for replay, so only the transcript and summary were saved."
            : reason === "published"
              ? "The audio was deleted when this check-in was published. The saved check-in and Seneca summary remain available."
              : reason === "manual"
                ? "You deleted the recording. The saved check-in and Seneca summary remain available."
                : "The audio was deleted after seven days. The saved check-in and Seneca summary remain available."}
        </p>
      </section>
    );
  }

  if (!recording.canPlayAudio) return null;

  const until = recording.audioExpiresAt
    ? new Date(recording.audioExpiresAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section className="ci-audio" data-testid="check-in-audio-section">
      <div className="ci-audio-head">
        <span>
          <AudioLines size={14} strokeWidth={2.3} />
        </span>
        <strong>Original recording</strong>
      </div>
      <button type="button" className="ci-audio-play" onClick={() => void togglePlay()} disabled={loading || deleting} data-testid="check-in-audio-play">
        {loading ? <Loader2 size={15} className="ci-spin" /> : playing ? <Pause size={15} strokeWidth={2.8} /> : <Play size={15} strokeWidth={2.8} />}
        <span>{loading ? "Loading recording" : playing ? "Pause" : elapsed > 0 ? "Resume recording" : "Play recording"}</span>
        <em>
          {formatClock(elapsed)} / {formatClock(recording.durationSec)}
        </em>
      </button>
      {until ? <p className="ci-audio-until">Deletes by {until}</p> : null}
      <p className="ci-audio-note">
        Only you can access this recording. Audio deletes when the check-in is published or after seven days—whichever happens first.
      </p>
      {error ? <p className="nw-error">{error}</p> : null}
      <button type="button" className="ci-audio-delete" onClick={() => void remove()} disabled={deleting} data-testid="check-in-audio-delete">
        {deleting ? <Loader2 size={13} className="ci-spin" /> : <Trash2 size={13} strokeWidth={2.3} />}
        Delete recording now
      </button>
    </section>
  );
}
