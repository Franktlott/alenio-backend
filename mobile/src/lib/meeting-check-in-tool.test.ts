import { describe, expect, test } from "bun:test";
import {
  activeMeetingCheckInPairs,
  checkInQuestionLabels,
  meetingCheckInWorkspacesForMember,
  uniqueMeetingCheckInMembers,
  type MeetingCheckInContext,
} from "./meeting-check-in-tool";

const context: MeetingCheckInContext = {
  sourceVideoRoomId: "room-1",
  roomKind: "group",
  calendarEventId: null,
  eligiblePairs: [
    {
      workspace: { id: "team-a", name: "Alpha" },
      member: {
        id: "member-1",
        name: "One",
        email: "one@example.com",
        image: null,
      },
    },
    {
      workspace: { id: "team-b", name: "Beta" },
      member: {
        id: "member-1",
        name: "One",
        email: "one@example.com",
        image: null,
      },
    },
    {
      workspace: { id: "team-a", name: "Alpha" },
      member: {
        id: "member-2",
        name: "Two",
        email: "two@example.com",
        image: null,
      },
    },
  ],
};

describe("meeting check-in tools", () => {
  test("only offers participants currently active in the call", () => {
    expect(
      activeMeetingCheckInPairs(context, ["member-1"]).map(
        (pair) => pair.member.id,
      ),
    ).toEqual(["member-1", "member-1"]);
  });

  test("shows a participant once before workspace selection", () => {
    const active = activeMeetingCheckInPairs(context, [
      "member-1",
      "member-2",
    ]);
    expect(uniqueMeetingCheckInMembers(active).map((pair) => pair.member.id)).toEqual([
      "member-1",
      "member-2",
    ]);
    expect(
      meetingCheckInWorkspacesForMember(active, "member-1").map(
        (pair) => pair.workspace.id,
      ),
    ).toEqual(["team-a", "team-b"]);
  });

  test("keeps only the questions to cover while talking", () => {
    expect(
      checkInQuestionLabels([
        { type: "section", order: 0, label: "Warm up" },
        { type: "long_text", order: 2, label: "What is going well?" },
        { type: "manager_notes", order: 3, label: "Leader comments" },
        { type: "short_text", order: 1, label: "How are you?" },
      ]),
    ).toEqual(["How are you?", "What is going well?"]);
  });
});
