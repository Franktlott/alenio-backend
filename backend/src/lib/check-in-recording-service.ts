import { prisma } from "../prisma";
import {
  audioExpiryFrom,
  type AudioDeleteReason,
  type AudioStatus,
} from "./check-in-audio-access";
import { appendLeaderCommentsFields, findLeaderCommentsField } from "./check-in-leader-comments";
import {
  parseTemplateFields,
  validateCheckInResponses,
  type CheckInTemplateField,
} from "./check-in-responses";
import { mapTranscriptToTemplate } from "./check-in-transcript-mapping";
import {
  OPEN_CHECK_IN_RECAP_FIELD_ID,
  OPEN_CHECK_IN_TITLE,
  openCheckInRecapField,
  structureOpenTranscript,
} from "./open-check-in-structuring";
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
/** How long a recording can sit untouched before we treat it as walked away from. */
export const RECORDING_ABANDONED_MS = 2 * RECORDING_SEGMENT_MAX_DURATION_SEC * 1000;
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

  // Finish means every segment is uploaded, so the retention window opens here
  // rather than after transcription. Writing it up can then take as long as it
  // needs, and a failed write-up still leaves the audio replayable for a retry.
  await startAudioRetention(recordingId);

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

  // An open check-in has no template: Seneca decides the questions from what
  // was actually discussed, and the draft carries that structure instead.
  const template = recording.templateId
    ? await prisma.oneOnOneTemplate.findFirst({
        where: { id: recording.templateId, teamId: recording.teamId },
      })
    : null;
  if (recording.templateId && !template) {
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

  let title = template?.title ?? OPEN_CHECK_IN_TITLE;
  let fields: CheckInTemplateField[] = template
    ? appendLeaderCommentsFields(parseTemplateFields(template.fields))
    : [];
  let responses: Record<string, string | number> = {};
  let unanswered: string[] = [];
  try {
    if (template) {
      const mapped = await mapTranscriptToTemplate({
        transcript,
        templateTitle: template.title,
        fields,
        memberName,
      });
      responses = mapped.responses;
      unanswered = mapped.unanswered;
    } else {
      const structured = await structureOpenTranscript({ transcript, memberName });
      title = structured.title;
      fields = appendLeaderCommentsFields([
        openCheckInRecapField() as CheckInTemplateField,
      ]);
      responses = structured.recap
        ? { [OPEN_CHECK_IN_RECAP_FIELD_ID]: structured.recap }
        : {};
      // The summary is the leader's own section, the same as a guided check-in.
      const leaderField = findLeaderCommentsField(fields);
      if (leaderField && structured.summary) {
        responses[leaderField.id] = structured.summary;
      }
    }
  } catch (err) {
    console.error("[check-in-recordings] mapping failed", err);
    // Fall back to handing the leader the raw transcript rather than nothing.
    if (template) {
      const leaderField = findLeaderCommentsField(fields);
      responses = leaderField ? { [leaderField.id]: transcript } : {};
    } else {
      title = OPEN_CHECK_IN_TITLE;
      fields = appendLeaderCommentsFields([
        openCheckInRecapField() as CheckInTemplateField,
      ]);
      responses = { [OPEN_CHECK_IN_RECAP_FIELD_ID]: transcript };
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
      templateId: template?.id ?? null,
      templateTitle: title,
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

  // A recording still "recording" long after its last segment means the app
  // went away without stopping it. Segments land at least every
  // RECORDING_SEGMENT_MAX_DURATION_SEC and each one touches the row, so a
  // window of twice that cannot catch a live conversation.
  const abandonedBefore = new Date(Date.now() - RECORDING_ABANDONED_MS);
  const abandoned = await prisma.checkInRecording.findMany({
    where: { status: "recording", updatedAt: { lt: abandonedBefore } },
    select: { id: true, _count: { select: { segments: true } } },
    take: 50,
  });
  for (const recording of abandoned) {
    if (recording._count.segments > 0) {
      // The conversation did happen, so write it up rather than binning it.
      const result = await finishRecording(recording.id).catch(() => null);
      if (result?.ok) finishedRecordings += 1;
      continue;
    }
    // Nothing was ever captured; drop it so it cannot show up as a dead row.
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
