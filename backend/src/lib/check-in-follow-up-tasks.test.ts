import { describe, expect, test } from "bun:test";
import { isOrphanCheckInFollowUpTask } from "./check-in-follow-up-tasks";

const MARKER = "[alenio:oneone-feedback]";
const description = `${MARKER}\n${JSON.stringify({
  meetingId: "meeting-1",
  fieldId: "__oneone_associate_feedback__",
  teamId: "team-1",
  memberUserId: "member-1",
  fieldLabel: "Associate feedback",
})}`;

describe("check-in follow-up cleanup", () => {
  test("keeps follow-ups while the check-in still exists", () => {
    expect(
      isOrphanCheckInFollowUpTask(
        { oneOnOneMeetingId: "meeting-1", description },
        new Set(["meeting-1"]),
      ),
    ).toBe(false);
  });

  test("treats a linked task as orphaned after the check-in is gone", () => {
    expect(
      isOrphanCheckInFollowUpTask(
        { oneOnOneMeetingId: "meeting-1", description },
        new Set(),
      ),
    ).toBe(true);
  });

  test("treats unlinked associate follow-up tasks as orphaned", () => {
    expect(
      isOrphanCheckInFollowUpTask(
        { oneOnOneMeetingId: null, description },
        new Set(),
      ),
    ).toBe(true);
  });

  test("does not delete ordinary tasks with no check-in link", () => {
    expect(
      isOrphanCheckInFollowUpTask(
        { oneOnOneMeetingId: null, description: "Stock the cooler" },
        new Set(),
      ),
    ).toBe(false);
  });
});
