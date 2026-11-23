import { prisma } from "../prisma";
import {
  audioExpiryFrom,
  type AudioDeleteReason,
  type AudioStatus,
} from "./check-in-audio-access";
import { findLeaderCommentsField } from "./check-in-leader-comments";
import {
  validateCheckInResponses,
  type CheckInTemplateField,
} from "./check-in-responses";
import {
  OPEN_CHECK_IN_RECAP_FIELD_ID,
  OPEN_CHECK_IN_TITLE,
  openCheckInFields,
  structureOpenTranscript,
} from "./open-check-in-structuring";
import {
  deleteStorageObjectEverywhere,
  downloadStorageObject,
} from "./firebase-storage";
import { checkInAudioFormatForPath, transcribeAudio } from "./seneca-transcribe";
import { preferLiveTranscriptForFinish } from "./check-in-live-transcription";

/** A single segment is capped well under the model's limit; the app rolls files every 5 minutes. */
export const RECORDING_SEGMENT_MAX_BYTES = 12 * 1024 * 1024;
export const RECORDING_MAX_DURATION_SEC = 90 * 60;
export const RECORDING_SEGMENT_MAX_DURATION_SEC = 10 * 60;
/** Segments stuck in `transcribing` past this are assumed lost to a restart. */
export const SEGMENT_STALE_MS = 10 * 60 * 1000;
/** How long a recording can sit untouched before we treat it as walked away from. */
export const RECORDING_ABANDONED_MS = 2 * RECORDING_SEGMENT_MAX_DURATION_SEC * 1000;
export const SEGMENT_MAX_ATTEMPTS = 3;

/**
 * recording = capture in progress;
 * draft = capture stopped, raw transcript kept, no AI write-up yet;
 * transcribing = write-up in flight;
 * ready = draft check-in meeting created;
 * failed = write-up gave up (see error).
 */
export type RecordingStatus =
  | "recording"
  | "draft"
  | "transcribing"
  | "ready"
  | "failed";

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
    const format = checkInAudioFormatForPath(segment.storagePath);
    const text = await transcribeAudio({
      bytes,
      filename: `segment-${segment.index}.${format.extension}`,
      mimeType: format.mimeType,
      prompt: previous?.text ?? undefined,
    });
    // The audio stays put: the creator can replay it until it expires, and a
    // failed segment can still be retried from storage.
    await prisma.checkInRecordingSegment.update({
      where: { id: segment.id },
      data: { status: "done", text, error: null },
    });
  } catch (err) {
    const attempts = segment.attempts + 1;
    const exhausted = attempts >= SEGMENT_MAX_ATTEMPTS;
    const message = err instanceof Error ? err.message : "Transcription failed.";
    await prisma.checkInRecordingSegment.update({
      where: { id: segment.id },
      data: { status: exhausted ? "failed" : "uploaded", error: message },
    });
    if (!exhausted) throw err;
  }
}

/**
 * Opens the seven-day replay window. Idempotent: a recording that already has
 * an expiry keeps it, so retries and the recovery sweep cannot extend it.
 */
export async function startAudioRetention(recordingId: string): Promise<void> {
  const now = new Date();
  await prisma.checkInRecording
    .updateMany({
      where: { id: recordingId, audioExpiresAt: null },
      data: {
        audioStatus: "available",
        audioCreatedAt: now,
        audioExpiresAt: audioExpiryFrom(now),
      },
    })
    .catch(() => null);
}

async function readSegmentAudio(storagePath: string): Promise<Uint8Array> {
  const bytes = await downloadStorageObject(storagePath);
  if (!bytes) throw new Error("Audio was no longer available.");
  return bytes;
}

export const UNTRANSCRIBED_PART_NOTE = "[part of this conversation could not be transcribed]";

/**
 * Below this many spoken words there is no conversation to write up. Speech
 * models also invent short phrases ("Thank you for watching") from silence, so
 * a near-empty transcript must not reach the write-up at all.
 */
export const MIN_TRANSCRIPT_WORDS = 15;

/** Words actually heard, ignoring the gap notes stitched in for failed parts. */
export function spokenWordCount(transcript: string): number {
  const spoken = transcript.split(UNTRANSCRIBED_PART_NOTE).join(" ");
  return spoken.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export const NOT_ENOUGH_HEARD_MESSAGE =
  "We couldn't hear enough of that conversation to write it up. Nothing was created. Try recording again closer to the microphone.";

export const NOTHING_TO_WRITE_UP_MESSAGE =
  "Seneca couldn't find anything from the conversation to write up, so nothing was created.";

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
      return UNTRANSCRIBED_PART_NOTE;
    })
    .filter(Boolean)
    .join("\n\n");
}

export type FinishRecordingResult =
  | { ok: true; meetingId: string; unanswered: string[] }
  | { ok: false; message: string };

/**
 * True when a recording has anything worth keeping as a draft — audio segments,
 * live transcript lines, a stitched transcript, or a non-zero duration.
 * Used by cancel and the abandoned sweep so captured work is never purged.
 */
export function recordingHasRecoverableContent(recording: {
  durationSec?: number | null;
  transcript?: string | null;
  segmentsCount?: number;
  transcriptSegmentsCount?: number;
}): boolean {
  if ((recording.segmentsCount ?? 0) > 0) return true;
  if ((recording.transcriptSegmentsCount ?? 0) > 0) return true;
  if ((recording.durationSec ?? 0) > 0) return true;
  if ((recording.transcript ?? "").trim().length > 0) return true;
  return false;
}

export type CancelRecordingResult =
  | { action: "deleted" }
  | { action: "drafted"; recordingId: string };

/**
 * Decide cancel vs draft for a recording row.
 * - `failed`: always delete (leader dismissed a write-up that already failed).
 * - recoverable content while still live (or a transcript draft): keep as draft.
 * - empty: delete.
 */
export function cancelRecordingDecision(recording: {
  status?: string | null;
  durationSec?: number | null;
  transcript?: string | null;
  segmentsCount?: number;
  transcriptSegmentsCount?: number;
}): "draft" | "delete" {
  if (recording.status === "failed") return "delete";
  if (recording.status === "draft") return "delete";
  return recordingHasRecoverableContent(recording) ? "draft" : "delete";
}

/**
 * Cancel is only allowed for empty starts or already-failed/dismissed drafts.
 * Live recordings with recoverable content are saved as transcript drafts.
 */
export async function cancelOrFinishRecording(
  recordingId: string,
): Promise<CancelRecordingResult> {
  const recording = await prisma.checkInRecording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      durationSec: true,
      transcript: true,
      status: true,
      _count: { select: { segments: true, transcriptSegments: true } },
    },
  });
  if (!recording) {
    return { action: "deleted" };
  }

  const decision = cancelRecordingDecision({
    status: recording.status,
    durationSec: recording.durationSec,
    transcript: recording.transcript,
    segmentsCount: recording._count.segments,
    transcriptSegmentsCount: recording._count.transcriptSegments,
  });

  if (decision === "draft") {
    // Keep the conversation — transcript only, no AI write-up.
    void saveRecordingDraft(recordingId).catch(async (err) => {
      console.error("[check-in-recordings] cancel→draft failed", err);
      await prisma.checkInRecording
        .update({
          where: { id: recordingId },
          data: {
            status: "failed",
            error: "We could not save that recording as a draft.",
          },
        })
        .catch(() => null);
    });
    return { action: "drafted", recordingId };
  }

  await purgeRecordingAudio(recordingId);
  await prisma.checkInRecording.delete({ where: { id: recordingId } });
  return { action: "deleted" };
}

/**
 * Assembles raw transcript text from live segments and/or audio STT.
 * Does not create a check-in meeting.
 */
export async function assembleRecordingTranscript(
  recordingId: string,
  options: { minLiveWords?: number } = {},
): Promise<{ transcript: string; hasAudioSegments: boolean } | null> {
  const recording = await prisma.checkInRecording.findUnique({
    where: { id: recordingId },
    include: { segments: true },
  });
  if (!recording) return null;

  const minLiveWords = options.minLiveWords ?? 1;

  if (recording.segments.length === 0 && recording.transcript?.trim()) {
    return {
      transcript: recording.transcript.trim(),
      hasAudioSegments: false,
    };
  }

  const liveTranscript = await preferLiveTranscriptForFinish(
    recordingId,
    minLiveWords,
  );
  if (liveTranscript) {
    return {
      transcript: liveTranscript,
      hasAudioSegments: recording.segments.length > 0,
    };
  }

  if (recording.segments.length === 0) {
    return {
      transcript: recording.transcript?.trim() ?? "",
      hasAudioSegments: false,
    };
  }

  const pending = recording.segments.filter(
    (segment) => segment.status === "uploaded" || segment.status === "transcribing",
  );
  for (const segment of pending) {
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
  return {
    transcript: stitchTranscript(segments),
    hasAudioSegments: true,
  };
}

export type SaveRecordingDraftResult =
  | { ok: true; transcript: string }
  | { ok: false; message: string };

/**
 * Stops the write-up path: keeps audio + raw transcript as status `draft`.
 * Seneca is not called until the leader explicitly finishes / writes up.
 */
export async function saveRecordingDraft(
  recordingId: string,
): Promise<SaveRecordingDraftResult> {
  const recording = await prisma.checkInRecording.findUnique({
    where: { id: recordingId },
    select: {
      id: true,
      status: true,
      meetingId: true,
      transcript: true,
    },
  });
  if (!recording) return { ok: false, message: "Recording not found." };
  if (recording.meetingId) {
    return { ok: true, transcript: recording.transcript ?? "" };
  }
  if (recording.status === "draft" && recording.transcript?.trim()) {
    return { ok: true, transcript: recording.transcript };
  }

  const assembled = await assembleRecordingTranscript(recordingId, {
    minLiveWords: 1,
  });
  if (!assembled) return { ok: false, message: "Recording not found." };

  if (assembled.hasAudioSegments) {
    await startAudioRetention(recordingId);
  }

  await prisma.checkInRecording.update({
    where: { id: recordingId },
    data: {
      transcript: assembled.transcript || null,
      status: "draft",
      error: null,
    },
  });

  return { ok: true, transcript: assembled.transcript };
}

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

  // Transcript draft already assembled — only run the AI write-up.
  if (recording.status === "draft" && recording.transcript?.trim()) {
    await prisma.checkInRecording.update({
      where: { id: recordingId },
      data: { status: "transcribing", error: null },
    });
    return writeUpTranscript({
      recordingId,
      teamId: recording.teamId,
      memberUserId: recording.memberUserId,
      createdById: recording.createdById,
      templateId: recording.templateId,
      transcript: recording.transcript,
    });
  }

  const assembled = await assembleRecordingTranscript(recordingId, {
    minLiveWords: MIN_TRANSCRIPT_WORDS,
  });
  if (!assembled) return { ok: false, message: "Recording not found." };

  if (assembled.hasAudioSegments) {
    await startAudioRetention(recordingId);
  }

  await prisma.checkInRecording.update({
    where: { id: recordingId },
    data: { transcript: assembled.transcript, status: "transcribing" },
  });

  return writeUpTranscript({
    recordingId,
    teamId: recording.teamId,
    memberUserId: recording.memberUserId,
    createdById: recording.createdById,
    templateId: recording.templateId,
    transcript: assembled.transcript,
  });
}

/**
 * Turns a finished transcript into a draft check-in for the leader to review.
 *
 * Shared by both capture routes: audio recorded in person, and the live
 * transcript of a video call. Everything downstream of the transcript is
 * identical, so the draft, the AI chips and the transcript view behave the same
 * either way.
 */
export async function writeUpTranscript(params: {
  recordingId: string;
  teamId: string;
  memberUserId: string;
  createdById: string;
  templateId: string | null;
  transcript: string;
}): Promise<FinishRecordingResult> {
  const { recordingId, transcript } = params;

  // Never write up a conversation that isn't there. Without real words the
  // model has nothing to work from and will make a check-in up.
  if (spokenWordCount(transcript) < MIN_TRANSCRIPT_WORDS) {
    await prisma.checkInRecording.update({
      where: { id: recordingId },
      data: { status: "failed", error: NOT_ENOUGH_HEARD_MESSAGE },
    });
    return { ok: false, message: NOT_ENOUGH_HEARD_MESSAGE };
  }

  // Templates are retired: every recording becomes the fixed open write-up.
  // A leftover templateId from an old client is ignored.
  void params.templateId;

  const member = await prisma.user.findUnique({
    where: { id: params.memberUserId },
    select: { name: true, email: true },
  });
  const memberName = member?.name?.trim() || member?.email || "the team member";

  let title = OPEN_CHECK_IN_TITLE;
  let fields: CheckInTemplateField[] = openCheckInFields() as CheckInTemplateField[];
  let responses: Record<string, string | number> = {};
  let unanswered: string[] = [];
  let modelFoundNothing = false;
  try {
    const structured = await structureOpenTranscript({ transcript, memberName });
    title = structured.title;
    fields = openCheckInFields() as CheckInTemplateField[];
    responses = structured.recap
      ? { [OPEN_CHECK_IN_RECAP_FIELD_ID]: structured.recap }
      : {};
    const leaderField = findLeaderCommentsField(fields);
    if (leaderField && structured.summary) {
      responses[leaderField.id] = structured.summary;
    }
    modelFoundNothing = !structured.recap;
  } catch (err) {
    console.error("[check-in-recordings] mapping failed", err);
    // Fall back to handing the leader the raw transcript rather than nothing.
    title = OPEN_CHECK_IN_TITLE;
    fields = openCheckInFields() as CheckInTemplateField[];
    responses = { [OPEN_CHECK_IN_RECAP_FIELD_ID]: transcript };
    unanswered = fields
      .filter((field) => field.type !== "section" && field.type !== "associate_notes")
      .map((field) => field.label);
  }

  if (modelFoundNothing) {
    await prisma.checkInRecording.update({
      where: { id: recordingId },
      data: { status: "failed", error: NOTHING_TO_WRITE_UP_MESSAGE },
    });
    return { ok: false, message: NOTHING_TO_WRITE_UP_MESSAGE };
  }

  // Drafts tolerate blanks, but a bad value would block the leader at publish time.
  if (validateCheckInResponses(fields, responses, { draft: true })) {
    responses = {};
  }

  const meeting = await prisma.oneOnOneMeeting.create({
    data: {
      teamId: params.teamId,
      memberUserId: params.memberUserId,
      templateId: null,
      templateTitle: title,
      templateFields: JSON.stringify(fields),
      responses: JSON.stringify(responses),
      status: "draft",
      publishedAt: null,
      createdById: params.createdById,
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

  // A recording still "recording" long after its last activity means the app
  // went away without stopping it. Prefer finishing whenever any content
  // exists — never drop a started conversation.
  const abandonedBefore = new Date(Date.now() - RECORDING_ABANDONED_MS);
  const abandoned = await prisma.checkInRecording.findMany({
    where: { status: "recording", updatedAt: { lt: abandonedBefore } },
    select: {
      id: true,
      durationSec: true,
      transcript: true,
      _count: { select: { segments: true, transcriptSegments: true } },
    },
    take: 50,
  });
  for (const recording of abandoned) {
    const hasContent = recordingHasRecoverableContent({
      durationSec: recording.durationSec,
      transcript: recording.transcript,
      segmentsCount: recording._count.segments,
      transcriptSegmentsCount: recording._count.transcriptSegments,
    });
    if (hasContent) {
      // Abandoned capture becomes a transcript draft — write-up waits for the leader.
      const result = await saveRecordingDraft(recording.id).catch(() => null);
      if (result?.ok) finishedRecordings += 1;
      continue;
    }
    // Truly empty consent starts only — safe to clean up.
    await purgeRecordingAudio(recording.id);
    await prisma.checkInRecording.delete({ where: { id: recording.id } }).catch(() => null);
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

/**
 * The narrow slice of storage and database this deletion path touches, so the
 * retry and idempotency rules can be tested without either.
 */
export type AudioStore = {
  segments(recordingId: string): Promise<Array<{ id: string; storagePath: string | null }>>;
  /** Resolves false when the object could not be removed and is worth retrying. */
  removeObject(storagePath: string): Promise<boolean>;
  clearSegmentPath(segmentId: string): Promise<void>;
  setAudioStatus(
    recordingId: string,
    data: {
      audioStatus: AudioStatus;
      audioDeletedAt?: Date;
      audioDeleteReason?: AudioDeleteReason;
      bumpAttempts?: boolean;
    },
  ): Promise<void>;
  expiredRecordings(now: Date, limit: number): Promise<Array<{ id: string }>>;
};

export const prismaAudioStore: AudioStore = {
  segments: (recordingId) =>
    prisma.checkInRecordingSegment.findMany({
      where: { recordingId, storagePath: { not: null } },
      select: { id: true, storagePath: true },
    }),
  // A missing object already resolves true, because delete passes
  // ignoreNotFound, so re-running over deleted audio is not an error.
  removeObject: (storagePath) => deleteStorageObjectEverywhere(storagePath),
  clearSegmentPath: async (segmentId) => {
    await prisma.checkInRecordingSegment
      .update({ where: { id: segmentId }, data: { storagePath: null } })
      .catch(() => null);
  },
  setAudioStatus: async (recordingId, data) => {
    await prisma.checkInRecording.update({
      where: { id: recordingId },
      data: {
        audioStatus: data.audioStatus,
        ...(data.audioDeletedAt ? { audioDeletedAt: data.audioDeletedAt } : {}),
        ...(data.audioDeleteReason ? { audioDeleteReason: data.audioDeleteReason } : {}),
        ...(data.bumpAttempts ? { audioDeleteAttempts: { increment: 1 } } : {}),
      },
    });
  },
  expiredRecordings: (now, limit) =>
    prisma.checkInRecording.findMany({
      // Rows left mid-delete or failed are picked up again on the next pass.
      where: {
        audioStatus: { in: ["available", "deleting", "deletion_failed"] },
        audioExpiresAt: { lte: now },
      },
      orderBy: { audioExpiresAt: "asc" },
      take: limit,
      select: { id: true },
    }),
};

/**
 * Removes the audio for one recording and records that it is gone. The
 * transcript, the draft, and everything saved on the check-in are untouched:
 * only the sound is deleted.
 */
export async function deleteRecordingAudio(
  recordingId: string,
  now: Date = new Date(),
  store: AudioStore = prismaAudioStore,
  reason: AudioDeleteReason = "manual",
): Promise<boolean> {
  // Marked first so a playback request landing mid-delete is refused rather
  // than handed a URL to an object that is about to disappear.
  await store.setAudioStatus(recordingId, { audioStatus: "deleting" });

  let allGone = true;
  for (const segment of await store.segments(recordingId)) {
    if (!segment.storagePath) continue;
    const removed = await store.removeObject(segment.storagePath).catch(() => false);
    if (removed) {
      await store.clearSegmentPath(segment.id);
    } else {
      allGone = false;
    }
  }

  if (!allGone) {
    await store.setAudioStatus(recordingId, {
      audioStatus: "deletion_failed",
      bumpAttempts: true,
    });
    return false;
  }

  await store.setAudioStatus(recordingId, {
    audioStatus: "deleted",
    audioDeletedAt: now,
    audioDeleteReason: reason,
  });
  return true;
}

/**
 * Audio exists to produce the write-up, so publishing the check-in ends its
 * purpose: the seven days are a ceiling, not a promise. Best effort, because a
 * storage problem must never block the leader from saving their check-in; the
 * hourly sweep will pick up anything left behind.
 */
export async function deleteAudioForPublishedMeeting(meetingId: string): Promise<void> {
  try {
    const recording = await prisma.checkInRecording.findFirst({
      where: { meetingId, audioStatus: { in: ["available", "pending", "deletion_failed"] } },
      select: { id: true },
    });
    if (!recording) return;
    await deleteRecordingAudio(recording.id, new Date(), prismaAudioStore, "published");
  } catch (err) {
    console.error(`[check-in-audio] publish delete failed for meeting ${meetingId}:`, err);
  }
}

/**
 * Deleting a check-in takes its recording with it: the audio and the
 * transcript. If storage refuses, the transcript still goes and the row stays
 * behind only so the hourly sweep can finish removing the audio.
 */
export async function deleteRecordingForDeletedMeeting(recordingId: string): Promise<void> {
  try {
    const audioGone = await deleteRecordingAudio(recordingId, new Date(), prismaAudioStore, "manual");
    if (audioGone) {
      await prisma.checkInRecording.delete({ where: { id: recordingId } });
      return;
    }
    await prisma.checkInRecording.update({
      where: { id: recordingId },
      data: { transcript: null, audioExpiresAt: new Date() },
    });
    await prisma.checkInRecordingSegment.updateMany({
      where: { recordingId },
      data: { text: null },
    });
  } catch (err) {
    console.error(`[check-in-audio] delete with check-in failed for recording ${recordingId}:`, err);
  }
}

/** Recordings handled per pass, so one sweep cannot monopolise the hour. */
export const AUDIO_SWEEP_BATCH = 50;

/**
 * Deletes audio whose seven days are up. Runs from the hourly cleanup; safe to
 * run repeatedly, and anything that fails is retried on the next pass.
 */
export async function sweepExpiredRecordingAudio(
  now: Date = new Date(),
  store: AudioStore = prismaAudioStore,
): Promise<{ deletedRecordings: number; failedRecordings: number }> {
  let deletedRecordings = 0;
  let failedRecordings = 0;

  for (const recording of await store.expiredRecordings(now, AUDIO_SWEEP_BATCH)) {
    const ok = await deleteRecordingAudio(recording.id, now, store, "expired").catch(
      () => false,
    );
    if (ok) {
      deletedRecordings += 1;
    } else {
      failedRecordings += 1;
      // Ids only: never the transcript, the audio, or a playback URL.
      console.error(`[check-in-audio] delete failed for recording ${recording.id}`);
    }
  }

  return { deletedRecordings, failedRecordings };
}
