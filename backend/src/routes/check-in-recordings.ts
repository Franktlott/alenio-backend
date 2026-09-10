import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prismaRouteError } from "../lib/prisma-errors";
import { canManageCheckIns } from "../lib/workspace-role-policy";
import { uploadFileToFirebaseStorage } from "../lib/firebase-storage";
import {
  isSupportedCheckInAudio,
  transcriptionAvailable,
  transcriptionUnavailableMessage,
} from "../lib/seneca-transcribe";
import {
  finishRecording,
  purgeRecordingAudio,
  RECORDING_MAX_DURATION_SEC,
  RECORDING_SEGMENT_MAX_BYTES,
  RECORDING_SEGMENT_MAX_DURATION_SEC,
  transcribeSegment,
} from "../lib/check-in-recording-service";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const checkInRecordingsRouter = new Hono<{ Variables: Variables }>();
checkInRecordingsRouter.use("*", authGuard);

const startSchema = z.object({
  templateId: z.string().min(1),
  /** The leader confirms the associate was told the conversation is recorded. */
  consentAcknowledged: z.literal(true),
});

const segmentSchema = z.object({
  index: z.number().int().min(0).max(200),
  data: z.string().min(1),
  contentType: z.string().min(1).max(100).optional(),
  durationSec: z.number().int().min(0).max(RECORDING_SEGMENT_MAX_DURATION_SEC).optional(),
});

const finishSchema = z.object({
  durationSec: z.number().int().min(0).max(RECORDING_MAX_DURATION_SEC).optional(),
});

async function getMembership(
  c: { get: (key: "user" | "session") => unknown },
  teamId: string,
) {
  const user = c.get("user") as { id?: string } | null;
  const session = c.get("session") as { user?: { id?: string } } | null;
  const ids = [
    ...new Set(
      [user?.id, session?.user?.id].filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      ),
    ),
  ];
  for (const userId of ids) {
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (membership) return membership;
  }
  return null;
}

function serializeRecording(recording: {
  id: string;
  status: string;
  durationSec: number;
  transcript: string | null;
  error: string | null;
  meetingId: string | null;
  templateId: string;
  createdAt: Date;
}) {
  return {
    id: recording.id,
    status: recording.status,
    durationSec: recording.durationSec,
    transcript: recording.transcript,
    error: recording.error,
    meetingId: recording.meetingId,
    templateId: recording.templateId,
    createdAt: recording.createdAt.toISOString(),
  };
}

/** Loads a recording the caller is allowed to act on. */
async function loadOwnedRecording(
  recordingId: string,
  teamId: string,
  memberUserId: string,
  userId: string,
) {
  return prisma.checkInRecording.findFirst({
    where: { id: recordingId, teamId, memberUserId, createdById: userId },
  });
}

// POST /api/teams/:teamId/members/:memberUserId/check-in-recordings
checkInRecordingsRouter.post(
  "/:memberUserId/check-in-recordings",
  zValidator("json", startSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership || !canManageCheckIns(membership.role)) {
      return c.json(
        { error: { message: "You cannot record a check-in for this member", code: "FORBIDDEN" } },
        403,
      );
    }
    if (!transcriptionAvailable()) {
      return c.json(
        { error: { message: transcriptionUnavailableMessage(), code: "SENECA_UNAVAILABLE" } },
        503,
      );
    }

    const body = c.req.valid("json");
    const template = await prisma.oneOnOneTemplate.findFirst({
      where: { id: body.templateId, teamId },
      select: { id: true },
    });
    if (!template) {
      return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
    }

    const member = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: memberUserId, teamId } },
      select: { userId: true },
    });
    if (!member) {
      return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      const recording = await prisma.checkInRecording.create({
        data: {
          teamId,
          memberUserId,
          createdById: user.id,
          templateId: template.id,
          status: "recording",
          consentAckAt: new Date(),
        },
      });
      return c.json({ data: serializeRecording(recording) }, 201);
    } catch (err) {
      return prismaRouteError(c, err, "[check-in-recordings] POST failed");
    }
  },
);

// POST /api/teams/:teamId/members/:memberUserId/check-in-recordings/:id/segments
checkInRecordingsRouter.post(
  "/:memberUserId/check-in-recordings/:recordingId/segments",
  zValidator("json", segmentSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const recordingId = c.req.param("recordingId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership || !canManageCheckIns(membership.role)) {
      return c.json({ error: { message: "Not allowed", code: "FORBIDDEN" } }, 403);
    }

    const recording = await loadOwnedRecording(recordingId, teamId, memberUserId, user.id);
    if (!recording) {
      return c.json({ error: { message: "Recording not found", code: "NOT_FOUND" } }, 404);
    }
    if (recording.status === "ready" || recording.status === "failed") {
      return c.json(
        { error: { message: "This recording is already finished.", code: "VALIDATION_ERROR" } },
        409,
      );
    }

    const body = c.req.valid("json");
    const contentType = (body.contentType ?? "audio/m4a").toLowerCase();
    if (!isSupportedCheckInAudio(contentType)) {
      return c.json(
        { error: { message: "That audio format is not supported.", code: "VALIDATION_ERROR" } },
        400,
      );
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(body.data, "base64");
    } catch {
      return c.json({ error: { message: "Invalid audio data.", code: "VALIDATION_ERROR" } }, 400);
    }
    if (bytes.length === 0) {
      return c.json({ error: { message: "Invalid audio data.", code: "VALIDATION_ERROR" } }, 400);
    }
    if (bytes.length > RECORDING_SEGMENT_MAX_BYTES) {
      return c.json(
        {
          error: {
            message: "That part of the recording is too large.",
            code: "PAYLOAD_TOO_LARGE",
          },
        },
        413,
      );
    }

    try {
      const stored = await uploadFileToFirebaseStorage({
        userId: user.id,
        teamId,
        slot: "check_in_audio",
        file: new File([bytes], `segment-${body.index}.m4a`, {
          type: contentType,
        }),
      });

      const segment = await prisma.checkInRecordingSegment.upsert({
        where: { recordingId_index: { recordingId, index: body.index } },
        create: {
          recordingId,
          index: body.index,
          storagePath: stored.storagePath,
          status: "uploaded",
          durationSec: body.durationSec ?? 0,
        },
        update: {
          storagePath: stored.storagePath,
          status: "uploaded",
          durationSec: body.durationSec ?? 0,
          error: null,
        },
      });

      await prisma.checkInRecording.update({
        where: { id: recordingId },
        data: { durationSec: { increment: body.durationSec ?? 0 } },
      });

      // Transcribe in the background so the app can keep recording.
      void transcribeSegment(segment.id, bytes).catch((err) => {
        console.error("[check-in-recordings] segment transcription failed", err);
      });

      return c.json({ data: { id: segment.id, index: segment.index, status: "uploaded" } }, 202);
    } catch (err) {
      return prismaRouteError(c, err, "[check-in-recordings] segment upload failed");
    }
  },
);

// POST /api/teams/:teamId/members/:memberUserId/check-in-recordings/:id/finish
checkInRecordingsRouter.post(
  "/:memberUserId/check-in-recordings/:recordingId/finish",
  zValidator("json", finishSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const recordingId = c.req.param("recordingId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership || !canManageCheckIns(membership.role)) {
      return c.json({ error: { message: "Not allowed", code: "FORBIDDEN" } }, 403);
    }

    const recording = await loadOwnedRecording(recordingId, teamId, memberUserId, user.id);
    if (!recording) {
      return c.json({ error: { message: "Recording not found", code: "NOT_FOUND" } }, 404);
    }

    const body = c.req.valid("json");
    if (typeof body.durationSec === "number") {
      await prisma.checkInRecording.update({
        where: { id: recordingId },
        data: { durationSec: body.durationSec },
      });
    }
    if (recording.status === "recording") {
      await prisma.checkInRecording.update({
        where: { id: recordingId },
        data: { status: "transcribing" },
      });
    }

    // Runs in the background; the app polls GET for the resulting draft.
    void finishRecording(recordingId).catch(async (err) => {
      console.error("[check-in-recordings] finish failed", err);
      await prisma.checkInRecording
        .update({
          where: { id: recordingId },
          data: {
            status: "failed",
            error: "We could not turn that recording into a check-in.",
          },
        })
        .catch(() => null);
    });

    const updated = await prisma.checkInRecording.findUnique({ where: { id: recordingId } });
    return c.json({ data: serializeRecording(updated ?? recording) }, 202);
  },
);

// GET /api/teams/:teamId/members/:memberUserId/check-in-recordings/active
// Backs the locked "writing up" rows in the check-ins list, so a leader can
// leave the recording screen and still see work in flight when they come back.
// Declared before the /:recordingId route so "active" is not read as an id.
checkInRecordingsRouter.get(
  "/:memberUserId/check-in-recordings/active",
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership || !canManageCheckIns(membership.role)) {
      return c.json({ error: { message: "Not allowed", code: "FORBIDDEN" } }, 403);
    }

    try {
      // Only work the leader is waiting on. "recording" is left out because it
      // is either happening behind the recording screen or was abandoned when
      // the app closed, and neither is a check-in worth showing; the cleanup
      // sweep decides whether an abandoned one becomes a draft or is dropped.
      // "ready" is left out because the draft itself is then in the meetings
      // list. Failures stay so the leader hears about them.
      const recordings = await prisma.checkInRecording.findMany({
        where: {
          teamId,
          memberUserId,
          createdById: user.id,
          status: { in: ["transcribing", "failed"] },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      if (recordings.length === 0) return c.json({ data: [] });

      const templates = await prisma.oneOnOneTemplate.findMany({
        where: { id: { in: [...new Set(recordings.map((r) => r.templateId))] } },
        select: { id: true, title: true },
      });
      const titleById = new Map(templates.map((t) => [t.id, t.title]));

      return c.json({
        data: recordings.map((recording) => ({
          ...serializeRecording(recording),
          templateTitle: titleById.get(recording.templateId) ?? "Check-in",
        })),
      });
    } catch (err) {
      return prismaRouteError(c, err, "[check-in-recordings] active list failed");
    }
  },
);

// GET /api/teams/:teamId/members/:memberUserId/check-in-recordings/for-meeting/:meetingId
// Lets a leader read back the transcript behind a saved check-in.
checkInRecordingsRouter.get(
  "/:memberUserId/check-in-recordings/for-meeting/:meetingId",
  async (c) => {
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const meetingId = c.req.param("meetingId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership || !canManageCheckIns(membership.role)) {
      return c.json({ error: { message: "Not allowed", code: "FORBIDDEN" } }, 403);
    }

    const recording = await prisma.checkInRecording.findFirst({
      where: { meetingId, teamId, memberUserId },
    });
    if (!recording) {
      return c.json({ error: { message: "Recording not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: serializeRecording(recording) });
  },
);

// GET /api/teams/:teamId/members/:memberUserId/check-in-recordings/:id
checkInRecordingsRouter.get(
  "/:memberUserId/check-in-recordings/:recordingId",
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const recordingId = c.req.param("recordingId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership || !canManageCheckIns(membership.role)) {
      return c.json({ error: { message: "Not allowed", code: "FORBIDDEN" } }, 403);
    }

    const recording = await loadOwnedRecording(recordingId, teamId, memberUserId, user.id);
    if (!recording) {
      return c.json({ error: { message: "Recording not found", code: "NOT_FOUND" } }, 404);
    }
    return c.json({ data: serializeRecording(recording) });
  },
);

// POST /api/teams/:teamId/members/:memberUserId/check-in-recordings/:id/cancel
checkInRecordingsRouter.post(
  "/:memberUserId/check-in-recordings/:recordingId/cancel",
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;
    const recordingId = c.req.param("recordingId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership || !canManageCheckIns(membership.role)) {
      return c.json({ error: { message: "Not allowed", code: "FORBIDDEN" } }, 403);
    }

    const recording = await loadOwnedRecording(recordingId, teamId, memberUserId, user.id);
    if (!recording) {
      return c.json({ error: { message: "Recording not found", code: "NOT_FOUND" } }, 404);
    }

    try {
      await purgeRecordingAudio(recordingId);
      await prisma.checkInRecording.delete({ where: { id: recordingId } });
      return c.json({ data: { ok: true } });
    } catch (err) {
      return prismaRouteError(c, err, "[check-in-recordings] cancel failed");
    }
  },
);

export default checkInRecordingsRouter;
