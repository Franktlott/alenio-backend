import { prisma } from "../prisma";

export type TranscriptSegmentInput = {
  /** Client or provider stable id for idempotent upserts. */
  providerEventId?: string | null;
  sequence?: number;
  startMs: number;
  endMs?: number | null;
  text: string;
  speakerLabel?: string | null;
};

export type SerializedTranscriptSegment = {
  id: string;
  sequence: number;
  startMs: number;
  endMs: number | null;
  text: string;
  speakerLabel: string | null;
  providerEventId: string | null;
};

/**
 * Formats stored live-transcript segments the same way video call lines are
 * rendered for Seneca: optional speaker, then text, one utterance per line.
 */
export function stitchLiveTranscriptSegments(
  segments: Array<{
    startMs: number;
    text: string;
    speakerLabel: string | null;
  }>,
): string {
  return segments
    .map((segment) => {
      const text = segment.text.trim();
      if (!text) return "";
      const speaker = segment.speakerLabel?.trim();
      return speaker ? `${speaker}: ${text}` : text;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function serializeTranscriptSegment(segment: {
  id: string;
  sequence: number;
  startMs: number;
  endMs: number | null;
  text: string;
  speakerLabel: string | null;
  providerEventId: string | null;
}): SerializedTranscriptSegment {
  return {
    id: segment.id,
    sequence: segment.sequence,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    speakerLabel: segment.speakerLabel,
    providerEventId: segment.providerEventId,
  };
}

/**
 * Upserts a finalized live-transcript utterance. Interim text must never be
 * written here. Retries with the same providerEventId do not duplicate rows.
 */
export async function upsertFinalTranscriptSegment(
  recordingId: string,
  input: TranscriptSegmentInput,
): Promise<SerializedTranscriptSegment | null> {
  const text = input.text.trim();
  if (!text) return null;

  const providerEventId = input.providerEventId?.trim() || null;
  const speakerLabel = input.speakerLabel?.trim() || null;
  const startMs = Math.max(0, Math.floor(input.startMs));
  const endMs =
    input.endMs == null ? null : Math.max(startMs, Math.floor(input.endMs));

  if (providerEventId) {
    const existing = await prisma.checkInTranscriptSegment.findUnique({
      where: {
        recordingId_providerEventId: { recordingId, providerEventId },
      },
    });
    if (existing) {
      const updated = await prisma.checkInTranscriptSegment.update({
        where: { id: existing.id },
        data: {
          text,
          startMs,
          endMs,
          speakerLabel,
        },
      });
      return serializeTranscriptSegment(updated);
    }
  }

  const sequence =
    input.sequence ??
    ((
      await prisma.checkInTranscriptSegment.aggregate({
        where: { recordingId },
        _max: { sequence: true },
      })
    )._max.sequence ?? -1) + 1;

  try {
    const created = await prisma.checkInTranscriptSegment.create({
      data: {
        recordingId,
        sequence,
        startMs,
        endMs,
        text,
        speakerLabel,
        providerEventId,
      },
    });
    return serializeTranscriptSegment(created);
  } catch (err) {
    // Concurrent insert with the same providerEventId — re-read.
    if (providerEventId) {
      const raced = await prisma.checkInTranscriptSegment.findUnique({
        where: {
          recordingId_providerEventId: { recordingId, providerEventId },
        },
      });
      if (raced) return serializeTranscriptSegment(raced);
    }
    throw err;
  }
}

export async function listTranscriptSegments(recordingId: string) {
  const segments = await prisma.checkInTranscriptSegment.findMany({
    where: { recordingId },
    orderBy: [{ sequence: "asc" }, { startMs: "asc" }],
  });
  return segments.map(serializeTranscriptSegment);
}

export async function stitchStoredLiveTranscript(
  recordingId: string,
): Promise<string> {
  const segments = await prisma.checkInTranscriptSegment.findMany({
    where: { recordingId },
    orderBy: [{ sequence: "asc" }, { startMs: "asc" }],
    select: { startMs: true, text: true, speakerLabel: true },
  });
  return stitchLiveTranscriptSegments(segments);
}
