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
  // Merge when a commit landed mid-sentence (no terminal punctuation yet).
  if (last && !last.interim && shouldMergeTranscriptFinals(last, finalLine)) {
    const merged: LiveTranscriptLine = {
      ...last,
      id: finalLine.id,
      text: joinTranscriptFragments(last.text, finalLine.text),
      endMs: finalLine.endMs ?? last.endMs,
      speakerLabel: last.speakerLabel ?? finalLine.speakerLabel,
    };
    return [...withoutAnyInterim.slice(0, -1), merged];
  }
  return [...withoutAnyInterim, finalLine];
}

/** True when the previous final looks unfinished and the next continues it. */
export function shouldMergeTranscriptFinals(
  previous: Pick<LiveTranscriptLine, "text" | "endMs" | "startMs" | "speakerLabel">,
  next: Pick<LiveTranscriptLine, "text" | "endMs" | "startMs" | "speakerLabel">,
): boolean {
  const prev = previous.text.trim();
  const incoming = next.text.trim();
  if (!prev || !incoming) return false;
  if (previous.speakerLabel && next.speakerLabel && previous.speakerLabel !== next.speakerLabel) {
    return false;
  }
  if (/[.!?…]["')\]]?\s*$/.test(prev)) return false;
  const gapMs =
    next.startMs - (previous.endMs ?? previous.startMs);
  if (gapMs > 2500) return false;
  return true;
}

export function joinTranscriptFragments(previous: string, next: string): string {
  const left = previous.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  // Avoid "under How" vs "understand" — prefer a space unless the previous
  // fragment looks mid-word (ends with a letter and next is lowercase).
  if (/[A-Za-z]$/.test(left) && /^[a-z]/.test(right)) {
    return `${left}${right}`;
  }
  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}

export function liveTranscriptWordCount(lines: LiveTranscriptLine[]): number {
  return lines
    .filter((line) => !line.interim)
    .reduce(
      (total, line) => total + line.text.split(/\s+/).filter(Boolean).length,
      0,
    );
}
