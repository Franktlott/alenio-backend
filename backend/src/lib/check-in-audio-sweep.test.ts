import { beforeEach, describe, expect, test } from "bun:test";
import {
  AUDIO_SWEEP_BATCH,
  deleteRecordingAudio,
  sweepExpiredRecordingAudio,
  type AudioStore,
} from "./check-in-recording-service";
import type { AudioStatus } from "./check-in-audio-access";

const NOW = new Date("2026-09-16T12:00:00.000Z");

type FakeRecording = {
  id: string;
  audioStatus: AudioStatus;
  audioExpiresAt: Date | null;
  audioDeletedAt: Date | null;
  audioDeleteAttempts: number;
  transcript: string;
  segments: Array<{ id: string; storagePath: string | null }>;
};

/**
 * Stands in for storage and the database so the deletion rules can be checked
 * without either. `failing` names object paths that refuse to delete.
 */
function fakeStore(recordings: FakeRecording[], failing = new Set<string>()) {
  const objects = new Set<string>();
  for (const recording of recordings) {
    for (const segment of recording.segments) {
      if (segment.storagePath) objects.add(segment.storagePath);
    }
  }
  const byId = new Map(recordings.map((r) => [r.id, r]));
  const statusWrites: Array<{ id: string; status: AudioStatus }> = [];
  let removeCalls = 0;

  const store: AudioStore = {
    segments: async (recordingId) =>
      (byId.get(recordingId)?.segments ?? []).filter((s) => s.storagePath),
    removeObject: async (storagePath) => {
      removeCalls += 1;
      if (failing.has(storagePath)) return false;
      // Mirrors ignoreNotFound: deleting something already gone succeeds.
      objects.delete(storagePath);
      return true;
    },
    clearSegmentPath: async (segmentId) => {
      for (const recording of recordings) {
        for (const segment of recording.segments) {
          if (segment.id === segmentId) segment.storagePath = null;
        }
      }
    },
    setAudioStatus: async (recordingId, data) => {
      const recording = byId.get(recordingId);
      if (!recording) throw new Error(`unknown recording ${recordingId}`);
      recording.audioStatus = data.audioStatus;
      if (data.audioDeletedAt) recording.audioDeletedAt = data.audioDeletedAt;
      if (data.bumpAttempts) recording.audioDeleteAttempts += 1;
      statusWrites.push({ id: recordingId, status: data.audioStatus });
    },
    expiredRecordings: async (now, limit) =>
      recordings
        .filter(
          (r) =>
            ["available", "deleting", "deletion_failed"].includes(r.audioStatus) &&
            r.audioExpiresAt !== null &&
            r.audioExpiresAt.getTime() <= now.getTime(),
        )
        .slice(0, limit)
        .map((r) => ({ id: r.id })),
  };

  return {
    store,
    objects,
    statusWrites,
    removeCalls: () => removeCalls,
    get: (id: string) => byId.get(id)!,
  };
}

function expired(id: string, segments = 2): FakeRecording {
  return {
    id,
    audioStatus: "available",
    audioExpiresAt: new Date(NOW.getTime() - 1000),
    audioDeletedAt: null,
    audioDeleteAttempts: 0,
    transcript: "We opened with last week's numbers.",
    segments: Array.from({ length: segments }, (_, i) => ({
      id: `${id}-seg-${i}`,
      storagePath: `check-in-audio/team_1/${id}-${i}.m4a`,
    })),
  };
}

describe("deleteRecordingAudio", () => {
  let fake: ReturnType<typeof fakeStore>;

  beforeEach(() => {
    fake = fakeStore([expired("rec_1", 3)]);
  });

  test("removes every part of a multi-part recording", async () => {
    const ok = await deleteRecordingAudio("rec_1", NOW, fake.store);
    expect(ok).toBe(true);
    expect(fake.objects.size).toBe(0);
    expect(fake.get("rec_1").audioStatus).toBe("deleted");
    expect(fake.get("rec_1").audioDeletedAt).toEqual(NOW);
  });

  test("revokes access before touching storage", async () => {
    await deleteRecordingAudio("rec_1", NOW, fake.store);
    // A playback request landing mid-delete must not be handed a URL.
    expect(fake.statusWrites[0]?.status).toBe("deleting");
  });

  test("clears the stored path so nothing points at a deleted object", async () => {
    await deleteRecordingAudio("rec_1", NOW, fake.store);
    expect(fake.get("rec_1").segments.every((s) => s.storagePath === null)).toBe(true);
  });

  test("leaves the transcript and the saved check-in alone", async () => {
    await deleteRecordingAudio("rec_1", NOW, fake.store);
    expect(fake.get("rec_1").transcript).toBe("We opened with last week's numbers.");
  });

  test("is idempotent: a second run changes nothing and stays deleted", async () => {
    await deleteRecordingAudio("rec_1", NOW, fake.store);
    const callsAfterFirst = fake.removeCalls();
    const ok = await deleteRecordingAudio("rec_1", NOW, fake.store);
    expect(ok).toBe(true);
    expect(fake.get("rec_1").audioStatus).toBe("deleted");
    // Paths are cleared, so there is nothing left to ask storage about.
    expect(fake.removeCalls()).toBe(callsAfterFirst);
  });

  test("marks a failure for retry rather than claiming the audio is gone", async () => {
    const stubborn = fakeStore(
      [expired("rec_2", 2)],
      new Set(["check-in-audio/team_1/rec_2-1.m4a"]),
    );
    const ok = await deleteRecordingAudio("rec_2", NOW, stubborn.store);
    expect(ok).toBe(false);
    expect(stubborn.get("rec_2").audioStatus).toBe("deletion_failed");
    expect(stubborn.get("rec_2").audioDeletedAt).toBeNull();
    expect(stubborn.get("rec_2").audioDeleteAttempts).toBe(1);
    // The part that did delete stays deleted; only the stubborn one remains.
    expect([...stubborn.objects]).toEqual(["check-in-audio/team_1/rec_2-1.m4a"]);
  });
});

describe("sweepExpiredRecordingAudio", () => {
  test("deletes audio whose seven days are up", async () => {
    const fake = fakeStore([expired("rec_1"), expired("rec_2")]);
    const result = await sweepExpiredRecordingAudio(NOW, fake.store);
    expect(result).toEqual({ deletedRecordings: 2, failedRecordings: 0 });
    expect(fake.objects.size).toBe(0);
  });

  test("leaves audio that is still inside its window", async () => {
    const fresh = expired("rec_fresh");
    fresh.audioExpiresAt = new Date(NOW.getTime() + 60_000);
    const fake = fakeStore([fresh]);
    const result = await sweepExpiredRecordingAudio(NOW, fake.store);
    expect(result.deletedRecordings).toBe(0);
    expect(fake.get("rec_fresh").audioStatus).toBe("available");
    expect(fake.objects.size).toBe(2);
  });

  test("running again after a clean pass does nothing", async () => {
    const fake = fakeStore([expired("rec_1")]);
    await sweepExpiredRecordingAudio(NOW, fake.store);
    const second = await sweepExpiredRecordingAudio(NOW, fake.store);
    expect(second).toEqual({ deletedRecordings: 0, failedRecordings: 0 });
  });

  test("retries a recording left in deletion_failed and reports it as deleted", async () => {
    const failing = new Set(["check-in-audio/team_1/rec_1-1.m4a"]);
    const fake = fakeStore([expired("rec_1")], failing);
    const first = await sweepExpiredRecordingAudio(NOW, fake.store);
    expect(first).toEqual({ deletedRecordings: 0, failedRecordings: 1 });

    // Storage recovers; the next hourly pass picks the same recording back up.
    failing.clear();
    const second = await sweepExpiredRecordingAudio(NOW, fake.store);
    expect(second).toEqual({ deletedRecordings: 1, failedRecordings: 0 });
    expect(fake.get("rec_1").audioStatus).toBe("deleted");
    expect(fake.objects.size).toBe(0);
  });

  test("picks up a recording abandoned mid-delete", async () => {
    const stuck = expired("rec_stuck");
    stuck.audioStatus = "deleting";
    const fake = fakeStore([stuck]);
    const result = await sweepExpiredRecordingAudio(NOW, fake.store);
    expect(result.deletedRecordings).toBe(1);
  });

  test("caps a pass so one sweep cannot monopolise the hour", async () => {
    const many = Array.from({ length: AUDIO_SWEEP_BATCH + 5 }, (_, i) =>
      expired(`rec_${i}`, 1),
    );
    const fake = fakeStore(many);
    const result = await sweepExpiredRecordingAudio(NOW, fake.store);
    expect(result.deletedRecordings).toBe(AUDIO_SWEEP_BATCH);
    // The remainder is not lost: the next pass takes them.
    const second = await sweepExpiredRecordingAudio(NOW, fake.store);
    expect(second.deletedRecordings).toBe(5);
  });
});
