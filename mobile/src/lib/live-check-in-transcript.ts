/**
 * Assembles live check-in transcription events for the recording UI.
 * Kept free of native imports so it can be tested.
 */

export type LiveTranscriptEvent = {
  event: "interim" | "final";
  id: string;
  text: string;
  startMs: number;
  endMs: number | null;
  speakerLabel: string | null;
};

export type LiveTranscriptLine = {
  id: string;
  text: string;
  startMs: number;
  endMs: number | null;
  speakerLabel: string | null;
  interim: boolean;
};

export function formatClockMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Applies one streaming event. Interim text replaces the previous interim for
 * the same id; finals clear that interim and append (or replace matching id).
 */
export function applyLiveTranscriptEvent(
  lines: LiveTranscriptLine[],
  event: LiveTranscriptEvent,
): LiveTranscriptLine[] {
  const text = event.text?.trim();
  if (!text) return lines;

  if (event.event === "interim") {
    const withoutInterim = lines.filter((line) => !line.interim || line.id === event.id);
    const next: LiveTranscriptLine = {
      id: event.id,
      text,
      startMs: event.startMs,
      endMs: null,
      speakerLabel: event.speakerLabel,
      interim: true,
    };
    const index = withoutInterim.findIndex((line) => line.id === event.id);
    if (index >= 0) {
      const copy = [...withoutInterim];
      copy[index] = next;
      return copy;
    }
    return [...withoutInterim.filter((line) => !line.interim), next];
  }

  const withoutMatchingInterim = lines.filter(
    (line) => !(line.interim && line.id === event.id) && !(line.id === event.id && !line.interim),
  );
  const withoutAnyInterim = withoutMatchingInterim.filter((line) => !line.interim);
  const finalLine: LiveTranscriptLine = {
    id: event.id,
    text,
    startMs: event.startMs,
    endMs: event.endMs,
    speakerLabel: event.speakerLabel,
    interim: false,
  };
  // Drop exact duplicate finals that streaming retries can re-send.
  const last = withoutAnyInterim[withoutAnyInterim.length - 1];
  if (last && !last.interim && last.text === finalLine.text) {
    return withoutAnyInterim;
  }
  return [...withoutAnyInterim, finalLine];
}

export function liveTranscriptWordCount(lines: LiveTranscriptLine[]): number {
  return lines
    .filter((line) => !line.interim)
    .reduce(
      (total, line) => total + line.text.split(/\s+/).filter(Boolean).length,
      0,
    );
}
