import { describe, expect, test } from "bun:test";
import {
  parseMeetingSignal,
  selectFeaturedParticipantId,
} from "./video-meeting-experience";

describe("video meeting experience", () => {
  test("validates meeting reactions and raised-hand signals", () => {
    expect(
      parseMeetingSignal({
        type: "reaction",
        reaction: "👏",
        senderName: "Alex",
        sentAt: 10,
      }),
    ).toEqual({
      type: "reaction",
      reaction: "👏",
      senderName: "Alex",
      sentAt: 10,
    });
    expect(
      parseMeetingSignal({
        type: "hand",
        raised: true,
        senderName: "Alex",
        sentAt: 11,
      }),
    ).toEqual({
      type: "hand",
      raised: true,
      senderName: "Alex",
      sentAt: 11,
    });
    expect(
      parseMeetingSignal({
        type: "reaction",
        reaction: "🚀",
        senderName: "Alex",
        sentAt: 12,
      }),
    ).toBeNull();
  });

  test("uses personal pins before active-speaker staging", () => {
    const participantIds = ["a", "b", "c", "d", "e"];
    expect(
      selectFeaturedParticipantId({
        pinnedParticipantId: "b",
        activeSpeakerId: "e",
        participantIds,
      }),
    ).toBe("b");
    expect(
      selectFeaturedParticipantId({
        pinnedParticipantId: null,
        activeSpeakerId: "e",
        participantIds,
      }),
    ).toBe("e");
  });

  test("keeps smaller calls in the grid until someone is pinned", () => {
    expect(
      selectFeaturedParticipantId({
        pinnedParticipantId: null,
        activeSpeakerId: "b",
        participantIds: ["a", "b", "c"],
      }),
    ).toBeNull();
  });
});
