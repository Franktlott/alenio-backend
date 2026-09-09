import { prisma } from "../prisma";
import { appendLeaderCommentsFields, findLeaderCommentsField } from "./check-in-leader-comments";
import {
  parseTemplateFields,
  validateCheckInResponses,
  type CheckInTemplateField,
} from "./check-in-responses";
import { mapTranscriptToTemplate } from "./check-in-transcript-mapping";
import {
  deleteStorageObjectEverywhere,
  downloadStorageObject,
} from "./firebase-storage";
import { transcribeAudio } from "./seneca-transcribe";

/** A single segment is capped well under the model's limit; the app rolls files every 5 minutes. */
export const RECORDING_SEGMENT_MAX_BYTES = 12 * 1024 * 1024;
export const RECORDING_MAX_DURATION_SEC = 90 * 60;
export const RECORDING_SEGMENT_MAX_DURATION_SEC = 10 * 60;
/** Segments stuck in `transcribing` past this are assumed lost to a restart. */
export const SEGMENT_STALE_MS = 10 * 60 * 1000;
export const SEGMENT_MAX_ATTEMPTS = 3;

export type RecordingStatus = "recording" | "transcribing" | "ready" | "failed";

async function clearSegmentAudio(segment: {
  id: string;
  storagePath: string | null;
}): Promise<void> {
  if (!segment.storagePath) return;
  await deleteStorageObjectEverywhere(segment.storagePath).catch(() => false);
  await prisma.checkInRecordingSegment
    .update({ where: { id: segment.id }, data: { storagePath: null } })
    .catch(() => null);
}

/**
 * Transcribes one stored segment and deletes its audio immediately afterwards.
 * Pass the bytes when they are already in hand from the upload request; retries
 * from the cleanup sweep re-read them from storage. Safe to call twice: a
 * segment already marked done is left alone.
 */
export async function transcribeSegment(
  segmentId: string,
  audioBytes?: Uint8Array,
): Promise<void> {
  const segment = await prisma.checkInRecordingSegment.findUnique({
    where: { id: segmentId },
  });
  if (!segment || segment.status === "done") return;
  if (!segment.storagePath && !audioBytes) {
    // Audio is gone and we have no text: nothing left to try.
    if (segment.status !== "failed") {
      await prisma.checkInRecordingSegment.update({
        where: { id: segment.id },
        data: { status: "failed", error: "Audio was no longer available." },
      });
    }
    return;
  }

  await prisma.checkInRecordingSegment.update({
    where: { id: segment.id },
    data: { status: "transcribing", attempts: { increment: 1 } },
  });

  try {
    const bytes = audioBytes ?? (await readSegmentAudio(segment.storagePath!));
    const previous = await prisma.checkInRecordingSegment.findFirst({
      where: { recordingId: segment.recordingId, index: segment.index - 1 },
      select: { text: true },
    });
    const text = await transcribeAudio({
      bytes,
      filename: `segment-${segment.index}.m4a`,
      mimeType: "audio/m4a",
      prompt: previous?.text ?? undefined,
    });
    await prisma.checkInRecordingSegment.update({
      where: { id: segment.id },
      data: { status: "done", text, error: null },
    });
    await clearSegmentAudio({ id: segment.id, storagePath: segment.storagePath });
  } catch (err) {
    const attempts = segment.attempts + 1;
    const exhausted = attempts >= SEGMENT_MAX_ATTEMPTS;
    const message = err instanceof Error ? err.message : "Transcription failed.";
    await prisma.checkInRecordingSegment.update({
      where: { id: segment.id },
      data: { status: exhausted ? "failed" : "uploaded", error: message },
    });
    // Keep the audio while a retry is still possible; the sweep re-reads it.
    if (exhausted) {
      await clearSegmentAudio({ id: segment.id, storagePath: segment.storagePath });
    } else {
      throw err;
    }
  }
}

async function readSegmentAudio(storagePath: string): Promise<Uint8Array> {
  const bytes = await downloadStorageObject(storagePath);
  if (!bytes) throw new Error("Audio was no longer available.");
  return bytes;
}

/** Joins finished segments in order, noting any gap so the leader is not misled. */
export function stitchTranscript(
  segments: Array<{ index: number; status: string; text: string | null }>,
): string {
  return segments
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((segment) => {
      const text = segment.text?.trim();
      if (text) return text;
      if (segment.status === "done") return "";
      return "[part of this conversation could not be transcribed]";
    })
    .filter(Boolean)
    .join("\n\n");
}

export type FinishRecordingResult =
  | { ok: true; meetingId: string; unanswered: string[] }
  | { ok: false; message: string };

/**
 * Stitches the transcript, maps it onto the template, and saves the result as a
 * draft check-in for the leader to review. When mapping fails we still keep the
 * transcript and drop it into leader comments so the conversation is not lost.
 */
export async function finishRecording(recordingId: string): Promise<FinishRecordingResult> {
  const recording = await prisma.checkInRecording.findUnique({
    where: { id: recordingId },
    include: { segments: true },
  });
  if (!recording) return { ok: false, message: "Recording not found." };
  if (recording.meetingId) {
    return { ok: true, meetingId: recording.meetingId, unanswered: [] };
  }

  const pending = recording.segments.filter(
    (segment) => segment.status === "uploaded" || segment.status === "transcribing",
  );
  for (const segment of pending) {
    // One retry inline covers a transient provider hiccup on the last segment.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const failed = await transcribeSegment(segment.id).then(
        () => false,
        () => true,
      );
      if (!failed) break;
    }
  }

  const segments = await prisma.checkInRecordingSegment.findMany({
    where: { recordingId },
  });
  const transcript = stitchTranscript(segments);
  await prisma.checkInRecording.update({
    where: { id: recordingId },
    data: { transcript, status: "transcribing" },
  });

  if (!transcript.trim()) {
    await prisma.checkInRecording.update({
      where: { id: recordingId },
      data: {
        status: "failed",
        error: "We could not hear anything in that recording.",
      },
    });
    return { ok: false, message: "We could not hear anything in that recording." };
  }

  const template = await prisma.oneOnOneTemplate.findFirst({
    where: { id: recording.templateId, teamId: recording.teamId },
  });
  if (!template) {
    await prisma.checkInRecording.update({
      where: { id: recordingId },
      data: { status: "failed", error: "That check-in template no longer exists." },
    });
    return { ok: false, message: "That check-in template no longer exists." };
  }

  const member = await prisma.user.findUnique({
    where: { id: recording.memberUserId },
    select: { name: true, email: true },
  });
  const memberName = member?.name?.trim() || member?.email || "the team member";
  const fields: CheckInTemplateField[] = appendLeaderCommentsFields(
    parseTemplateFields(template.fields),
  );

  let responses: Record<string, string | number> = {};
  let unanswered: string[] = [];
  try {
    const mapped = await mapTranscriptToTemplate({
      transcript,
      templateTitle: template.title,
      fields,
      memberName,
    });
    responses = mapped.responses;
    unanswered = mapped.unanswered;
  } catch (err) {
    console.error("[check-in-recordings] mapping failed", err);
    // Fall back to handing the leader the raw transcript rather than nothing.
    const leaderField = findLeaderCommentsField(fields);
    if (leaderField) {
      responses = { [leaderField.id]: transcript };
    }
    unanswered = fields
      .filter((field) => field.type !== "section" && field.type !== "associate_notes")
      .map((field) => field.label);
  }

  // Drafts tolerate blanks, but a bad value would block the leader at publish time.
  if (validateCheckInResponses(fields, responses, { draft: true })) {
    responses = {};
  }

  const meeting = await prisma.oneOnOneMeeting.create({
    data: {
      teamId: recording.teamId,
      memberUserId: recording.memberUserId,
      templateId: template.id,
      templateTitle: template.title,
      templateFields: JSON.stringify(fields),
      responses: JSON.stringify(responses),
      status: "draft",
      publishedAt: null,
      createdById: recording.createdById,
      captureMode: "recorded",
    },
  });

  await prisma.checkInRecording.update({
    where: { id: recordingId },
    data: { status: "ready", meetingId: meeting.id, error: null },
  });

  return { ok: true, meetingId: meeting.id, unanswered };
}

/**
 * Recovers recordings stranded by a restart mid-transcription, and purges audio
 * for recordings the leader walked away from. Called from the hourly cleanup.
 */
export async function sweepStalledRecordings(): Promise<{
  retriedSegments: number;
  finishedRecordings: number;
  purgedRecordings: number;
}> {
  const staleBefore = new Date(Date.now() - SEGMENT_STALE_MS);
  let retriedSegments = 0;
  let finishedRecordings = 0;
  let purgedRecordings = 0;

  const stranded = await prisma.checkInRecordingSegment.findMany({
    where: {
      status: { in: ["uploaded", "transcribing"] },
      updatedAt: { lt: staleBefore },
      attempts: { lt: SEGMENT_MAX_ATTEMPTS },
      storagePath: { not: null },
    },
    select: { id: true },
    take: 50,
  });
  for (const segment of stranded) {
    try {
      await transcribeSegment(segment.id);
      retriedSegments += 1;
    } catch {
      /* attempts are recorded on the row; give up after the cap */
    }
  }

  const stalled = await prisma.checkInRecording.findMany({
    where: { status: "transcribing", meetingId: null, updatedAt: { lt: staleBefore } },
    select: { id: true },
    take: 20,
  });
  for (const recording of stalled) {
    const result = await finishRecording(recording.id).catch(() => null);
    if (result?.ok) finishedRecordings += 1;
  }

  // A recording still "recording" hours later means the app never came back.
  const abandonedBefore = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const abandoned = await prisma.checkInRecording.findMany({
    where: { status: "recording", updatedAt: { lt: abandonedBefore } },
    select: { id: true },
    take: 50,
  });
  for (const recording of abandoned) {
    await purgeRecordingAudio(recording.id);
    await prisma.checkInRecording
      .update({
        where: { id: recording.id },
        data: { status: "failed", error: "This recording was never finished." },
      })
      .catch(() => null);
    purgedRecordings += 1;
  }

  return { retriedSegments, finishedRecordings, purgedRecordings };
}

/** Deletes any audio still sitting in storage for a recording. */
export async function purgeRecordingAudio(recordingId: string): Promise<void> {
  const segments = await prisma.checkInRecordingSegment.findMany({
    where: { recordingId, storagePath: { not: null } },
    select: { id: true, storagePath: true },
  });
  for (const segment of segments) {
    await clearSegmentAudio(segment);
  }
}
