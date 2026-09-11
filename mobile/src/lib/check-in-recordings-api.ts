import { api } from "@/lib/api/api";

export type CheckInRecordingStatus =
  | "recording"
  | "transcribing"
  | "ready"
  | "failed";

/**
 * The audio's own lifecycle, separate from the write-up's status. Audio is kept
 * for seven days for whoever recorded it, then deleted.
 */
/**
 * Seven days is a ceiling, not a promise: publishing the check-in deletes the
 * audio sooner, whichever comes first.
 */
export type CheckInAudioDeleteReason = "published" | "expired" | "manual";

export type CheckInAudioStatus =
  | "pending"
  | "available"
  | "deleting"
  | "deleted"
  | "deletion_failed"
  /** A video check-in: the call was transcribed live, so there was never audio. */
  | "none";

/** device_mic = recorded in person; video_call = transcribed live on a call. */
export type CheckInRecordingSource = "device_mic" | "video_call";

export type CheckInRecording = {
  id: string;
  status: CheckInRecordingStatus;
  durationSec: number;
  transcript: string | null;
  error: string | null;
  meetingId: string | null;
  /** Null for an open check-in, which Seneca structures itself. */
  templateId: string | null;
  source: CheckInRecordingSource;
  audioStatus: CheckInAudioStatus;
  /** When the audio will be deleted; null once it is gone. */
  audioExpiresAt: string | null;
  /** False for a check-in recorded before audio was kept for replay at all. */
  audioRetained: boolean;
  /** Why the audio went away, so the app can say which rule applied. */
  audioDeleteReason: CheckInAudioDeleteReason | null;
  /** Whether this viewer may replay it. Only the person who recorded it can. */
  canPlayAudio: boolean;
  createdAt: string;
};

/**
 * A recording is stored as one part per few minutes of conversation, so replay
 * plays the parts back to back. Each link is short-lived and re-fetched.
 */
export type CheckInAudioPart = { index: number; url: string; durationSec: number };

export type CheckInAudioPlayback = {
  parts: CheckInAudioPart[];
  durationSec: number;
  expiresAt: string | null;
  urlTtlSec: number;
};

/** An in-flight or failed recording, as shown by the locked rows in the list. */
export type ActiveCheckInRecording = CheckInRecording & { templateTitle: string };

function recordingsPath(teamId: string, memberUserId: string): string {
  return `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(
    memberUserId,
  )}/check-in-recordings`;
}

/** Pass a null templateId to record an open check-in with no set questions. */
export function startCheckInRecording(
  teamId: string,
  memberUserId: string,
  templateId: string | null,
): Promise<CheckInRecording> {
  return api.post<CheckInRecording>(recordingsPath(teamId, memberUserId), {
    templateId,
    consentAcknowledged: true,
  });
}

/**
 * Writes up a video check-in from the call's live transcript. Returns straight
 * away; poll the recording until it is ready, the same as an in-person one.
 */
export function createCheckInFromTranscript(
  teamId: string,
  memberUserId: string,
  input: {
    templateId: string | null;
    transcript: string;
    durationSec?: number;
  },
): Promise<CheckInRecording> {
  return api.post<CheckInRecording>(
    `${recordingsPath(teamId, memberUserId)}/from-transcript`,
    { ...input, consentAcknowledged: true },
  );
}

export function uploadCheckInRecordingSegment(
  teamId: string,
  memberUserId: string,
  recordingId: string,
  segment: {
    index: number;
    data: string;
    contentType: string;
    durationSec: number;
  },
): Promise<{ id: string; index: number; status: string }> {
  return api.post(
    `${recordingsPath(teamId, memberUserId)}/${encodeURIComponent(recordingId)}/segments`,
    segment,
  );
}

export function finishCheckInRecording(
  teamId: string,
  memberUserId: string,
  recordingId: string,
  durationSec: number,
): Promise<CheckInRecording> {
  return api.post<CheckInRecording>(
    `${recordingsPath(teamId, memberUserId)}/${encodeURIComponent(recordingId)}/finish`,
    { durationSec },
  );
}

export function fetchCheckInRecording(
  teamId: string,
  memberUserId: string,
  recordingId: string,
): Promise<CheckInRecording> {
  return api.get<CheckInRecording>(
    `${recordingsPath(teamId, memberUserId)}/${encodeURIComponent(recordingId)}`,
  );
}

/**
 * Recordings still being written up, plus any that failed. Lets the check-ins
 * list show locked rows after the leader has left the recording screen.
 */
export function fetchActiveCheckInRecordings(
  teamId: string,
  memberUserId: string,
): Promise<ActiveCheckInRecording[]> {
  return api.get<ActiveCheckInRecording[]>(
    `${recordingsPath(teamId, memberUserId)}/active`,
  );
}

/** Reads back the transcript behind a saved check-in. Leaders only. */
export function fetchCheckInRecordingForMeeting(
  teamId: string,
  memberUserId: string,
  meetingId: string,
): Promise<CheckInRecording> {
  return api.get<CheckInRecording>(
    `${recordingsPath(teamId, memberUserId)}/for-meeting/${encodeURIComponent(meetingId)}`,
  );
}

/**
 * Fetches playable links for the original audio. The links expire in minutes,
 * so they are fetched when the leader presses play rather than kept around.
 */
export function fetchCheckInRecordingAudio(
  teamId: string,
  memberUserId: string,
  recordingId: string,
): Promise<CheckInAudioPlayback> {
  return api.get<CheckInAudioPlayback>(
    `${recordingsPath(teamId, memberUserId)}/${encodeURIComponent(recordingId)}/audio`,
  );
}

/** Deletes the audio early. The transcript and saved check-in stay. */
export function deleteCheckInRecordingAudio(
  teamId: string,
  memberUserId: string,
  recordingId: string,
): Promise<{ audioStatus: CheckInAudioStatus }> {
  return api.delete<{ audioStatus: CheckInAudioStatus }>(
    `${recordingsPath(teamId, memberUserId)}/${encodeURIComponent(recordingId)}/audio`,
  );
}

export function cancelCheckInRecording(
  teamId: string,
  memberUserId: string,
  recordingId: string,
): Promise<{ ok: boolean }> {
  return api.post(
    `${recordingsPath(teamId, memberUserId)}/${encodeURIComponent(recordingId)}/cancel`,
    {},
  );
}
