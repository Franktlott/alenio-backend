/** Display helpers for the recording screen, kept free of native imports. */

export function formatRecordingClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Maps the recorder's dBFS metering onto a 0-1 scale for the level meter. */
export function meteringToLevel(metering: number | undefined): number {
  if (metering === undefined || !Number.isFinite(metering)) return 0;
  const floor = -60;
  if (metering <= floor) return 0;
  if (metering >= 0) return 1;
  return (metering - floor) / -floor;
}

export type RecordingProcessingStage = "uploading" | "transcribing" | "drafting";

/** One line of reassurance while the conversation is turned into a draft. */
export function processingLabel(
  stage: RecordingProcessingStage,
  pendingUploads: number,
): string {
  if (stage === "uploading") {
    return pendingUploads > 1
      ? `Saving the last ${pendingUploads} parts of your conversation`
      : "Saving the last part of your conversation";
  }
  if (stage === "transcribing") return "Writing up what was said";
  return "Filling in your check-in";
}

const FALLBACK_RECORDING_ERROR = "Something went wrong while recording.";

/**
 * Native audio failures surface as Swift exception dumps, which are no use to a
 * leader mid-conversation. Anything that still reads like internals is replaced
 * with plain language.
 */
export function recordingErrorMessage(raw: unknown): string {
  const message =
    raw instanceof Error ? raw.message.trim() : typeof raw === "string" ? raw.trim() : "";
  if (!message) return FALLBACK_RECORDING_ERROR;

  if (/prepare recorder|prepareToRecord|AudioRecordingException/i.test(message)) {
    return "This device would not start its microphone. If another app is using the mic, close it and try again.";
  }
  if (/audio session/i.test(message)) {
    return "Another app is using the microphone. Close it and try again.";
  }
  if (/permission|denied|NSMicrophone/i.test(message)) {
    return "Alenio needs microphone access to record this check-in. You can turn it on in Settings.";
  }
  // Swift/Java exception dumps: class names, file:line markers, or arrow chains.
  if (/Exception|→|\.swift:|\.kt:|\.java:/.test(message)) {
    return FALLBACK_RECORDING_ERROR;
  }
  return message;
}
