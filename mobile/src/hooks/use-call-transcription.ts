import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DailyCall,
  DailyEventObjectTranscriptionError,
  DailyEventObjectTranscriptionMessage,
} from "@daily-co/react-native-daily-js";
import {
  appendTranscriptEvent,
  formatTranscript,
  transcriptIsUsable,
  transcriptWordCount,
  type TranscriptLine,
} from "@/lib/call-transcript";

export type TranscriptionStatus =
  | "idle"
  | "starting"
  | "active"
  | "stopped"
  | "error";

type Options = {
  /** The live call object; null before the call is created. */
  getCall: () => DailyCall | null;
  /** Only the meeting owner may start or stop transcription. */
  canControl: boolean;
};

/**
 * Runs Daily's live transcription for a call and collects the result.
 *
 * Daily streams text as it hears it and stores nothing, so the transcript only
 * ever lives in memory here until the leader chooses to write up a check-in
 * from it. Both participants are told it is on, whoever started it.
 */
export function useCallTranscription({ getCall, canControl }: Options) {
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const linesRef = useRef<TranscriptLine[]>([]);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const speakerFor = useCallback(
    (participantId: string): string => {
      const call = getCall();
      if (!call) return "Someone";
      const participants = call.participants();
      const match = Object.values(participants).find(
        (participant) => participant?.session_id === participantId,
      );
      return match?.user_name?.trim() || "Someone";
    },
    [getCall],
  );

  useEffect(() => {
    const call = getCall();
    if (!call) return;

    const onMessage = (event?: DailyEventObjectTranscriptionMessage) => {
      if (!event) return;
      setLines((current) =>
        appendTranscriptEvent(
          current,
          {
            participantId: event.participantId,
            text: event.text,
            timestamp: event.timestamp,
          },
          speakerFor,
        ),
      );
    };
    const onStarted = () => {
      setError(null);
      setStatus("active");
    };
    const onStopped = () => {
      setStatus((current) => (current === "error" ? current : "stopped"));
    };
    const onError = (event?: DailyEventObjectTranscriptionError) => {
      setError(event?.errorMsg || "Live notes stopped working.");
      setStatus("error");
    };

    call.on("transcription-message", onMessage);
    call.on("transcription-started", onStarted);
    call.on("transcription-stopped", onStopped);
    call.on("transcription-error", onError);
    return () => {
      call.off("transcription-message", onMessage);
      call.off("transcription-started", onStarted);
      call.off("transcription-stopped", onStopped);
      call.off("transcription-error", onError);
    };
  }, [getCall, speakerFor]);

  const start = useCallback(async () => {
    const call = getCall();
    if (!call || !canControl) return;
    setError(null);
    setStatus("starting");
    try {
      await call.startTranscription({ punctuate: true });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Live notes could not be started.",
      );
      setStatus("error");
    }
  }, [canControl, getCall]);

  const stop = useCallback(async () => {
    const call = getCall();
    if (!call || !canControl) return;
    try {
      await call.stopTranscription();
    } catch {
      /* the call is ending anyway; the transcript we have is still good */
    }
    setStatus((current) => (current === "error" ? current : "stopped"));
  }, [canControl, getCall]);

  const transcript = useMemo(() => formatTranscript(lines), [lines]);

  return {
    status,
    error,
    lines,
    transcript,
    wordCount: transcriptWordCount(lines),
    /** True once there is enough conversation to be worth writing up. */
    usable: transcriptIsUsable(lines),
    /** Read the latest transcript outside of render, e.g. as the call ends. */
    readTranscript: () => formatTranscript(linesRef.current),
    start,
    stop,
  };
}
