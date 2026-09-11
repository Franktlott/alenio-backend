/**
 * Assembles Daily's live `transcription-message` events into a readable,
 * speaker-labelled transcript. Kept free of native imports so it can be tested.
 *
 * Daily streams a message per detected utterance with the speaker's session id.
 * We only need the finished text, in order, attributed to a name.
 */

export type TranscriptEvent = {
  participantId: string;
  text: string;
  /** Daily sends a Date; a number or ISO string is accepted for convenience. */
  timestamp?: Date | string | number;
};

export type TranscriptLine = {
  speaker: string;
  text: string;
  atMs: number;
};

function toMs(timestamp: TranscriptEvent["timestamp"]): number {
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === "number") return timestamp;
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/**
 * Adds one event to the running transcript.
 *
 * Consecutive utterances from the same speaker are merged into a single line so
 * the transcript reads like speech rather than a list of fragments. Duplicate
 * text is dropped: Deepgram can re-send a corrected version of what it just
 * sent, and repeating it would skew the summary.
 */
export function appendTranscriptEvent(
  lines: TranscriptLine[],
  event: TranscriptEvent,
  speakerFor: (participantId: string) => string,
): TranscriptLine[] {
  const text = event.text?.trim();
  if (!text) return lines;

  const speaker = speakerFor(event.participantId);
  const last = lines[lines.length - 1];

  if (last && last.speaker === speaker) {
    if (last.text === text || last.text.endsWith(text)) return lines;
    const merged: TranscriptLine = {
      speaker,
      text: `${last.text} ${text}`.replace(/\s+/g, " ").trim(),
      atMs: last.atMs,
    };
    return [...lines.slice(0, -1), merged];
  }

  return [...lines, { speaker, text, atMs: toMs(event.timestamp) }];
}

/** Renders the transcript for the summarizer and for the leader to read. */
export function formatTranscript(lines: TranscriptLine[]): string {
  return lines
    .map((line) => `${line.speaker}: ${line.text}`)
    .join("\n")
    .trim();
}

/** Rough word count, used to decide whether there is enough to summarize. */
export function transcriptWordCount(lines: TranscriptLine[]): number {
  return lines.reduce(
    (total, line) => total + line.text.split(/\s+/).filter(Boolean).length,
    0,
  );
}

/**
 * Below this, the conversation is too thin to draft anything useful and we
 * should not offer to fill the form.
 */
export const MIN_TRANSCRIPT_WORDS = 40;

export function transcriptIsUsable(lines: TranscriptLine[]): boolean {
  return transcriptWordCount(lines) >= MIN_TRANSCRIPT_WORDS;
}
