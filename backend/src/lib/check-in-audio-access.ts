/**
 * Who may replay the original audio of a recorded check-in, and until when.
 *
 * Kept free of I/O so every rule is directly testable, and separate from the
 * workspace role policy on purpose: being a member, or even the workspace
 * owner, grants nothing here. Only the person who recorded the conversation
 * can hear it back.
 */

/** How long the creator can replay the audio after the upload completes. */
export const AUDIO_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Long enough to start playing, short enough that a leaked link dies quickly. */
export const AUDIO_PLAYBACK_URL_TTL_MS = 5 * 60 * 1000;

/**
 * Why audio was removed. Retention is a ceiling: publishing the check-in ends
 * the audio's purpose sooner, whichever comes first.
 */
export type AudioDeleteReason = "published" | "expired" | "manual";

export type AudioStatus =
  | "pending"
  | "available"
  | "deleting"
  | "deleted"
  | "deletion_failed";

export type AudioDenialReason = "not_creator" | "pending" | "expired" | "deleted";

export type AudioAccess =
  | { allow: true }
  | { allow: false; reason: AudioDenialReason; status: 403 | 404 | 410; message: string };

export type AudioAccessRecording = {
  createdById: string;
  audioStatus: string;
  audioExpiresAt: Date | null;
};

export function audioExpiryFrom(uploadCompletedAt: Date): Date {
  return new Date(uploadCompletedAt.getTime() + AUDIO_RETENTION_MS);
}

export function audioRetentionRemainingMs(
  expiresAt: Date | null,
  now: Date,
): number {
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

/**
 * Decided fresh on every playback request rather than cached, so revoking a
 * recording takes effect on the next tap.
 */
export function audioAccessDecision(params: {
  recording: AudioAccessRecording;
  userId: string;
  now: Date;
}): AudioAccess {
  const { recording, userId, now } = params;

  // Identity first: someone else's recording should look the same whether or
  // not the audio still exists.
  if (recording.createdById !== userId) {
    return {
      allow: false,
      reason: "not_creator",
      status: 403,
      message: "Only the person who recorded this check-in can play it back.",
    };
  }

  if (
    recording.audioStatus === "deleted" ||
    recording.audioStatus === "deleting" ||
    recording.audioStatus === "deletion_failed"
  ) {
    return {
      allow: false,
      reason: "deleted",
      status: 410,
      message: "That recording has been deleted.",
    };
  }

  if (recording.audioStatus !== "available" || !recording.audioExpiresAt) {
    return {
      allow: false,
      reason: "pending",
      status: 404,
      message: "That recording is not ready to play yet.",
    };
  }

  // Expiry is judged on server time, and independently of whether the sweep
  // has caught up, so access stops on the hour it should.
  if (recording.audioExpiresAt.getTime() <= now.getTime()) {
    return {
      allow: false,
      reason: "expired",
      status: 410,
      message: "That recording has been deleted.",
    };
  }

  return { allow: true };
}
