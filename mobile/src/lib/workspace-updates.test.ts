import { describe, expect, test } from "bun:test";
import type { ActivityFeedItem } from "@/components/activity/types";
import {
  applyReactionToggle,
  commentActionLabel,
  formatFeedTimestamp,
  hasReacted,
  isWorkspaceUpdateActivity,
  milestoneSubtitle,
  myReactionEmoji,
  nextMilestoneTarget,
  personalRecognitionToActivityEvent,
  reactionActionLabel,
  recognitionCategoryLabel,
  recognitionInvolvesWorkspaceMembers,
  recognitionParticipants,
  totalReactionCount,
  workspaceUpdateBody,
  workspaceUpdateHeadline,
} from "./workspace-updates";

const now = Date.parse("2026-09-15T17:00:00.000Z");

function feedItem(
  partial: Partial<ActivityFeedItem> & Pick<ActivityFeedItem, "type" | "title">,
): ActivityFeedItem {
  return {
    id: "item-1",
    timestamp: "2026-09-15T15:00:00.000Z",
    dateGroup: "today",
    actor: { id: "maya", name: "Maya Chen", image: null },
    metadata: {},
    reactions: {},
    ...partial,
  };
}

describe("isWorkspaceUpdateActivity", () => {
  test("keeps recognition and completed tasks", () => {
    expect(isWorkspaceUpdateActivity("celebration")).toBe(true);
    expect(isWorkspaceUpdateActivity("task_completed")).toBe(true);
  });

  test("keeps momentum milestones but not personal bests", () => {
    expect(isWorkspaceUpdateActivity("task_milestone")).toBe(true);
    expect(isWorkspaceUpdateActivity("personal_best")).toBe(false);
  });

  test("drops other workspace activity", () => {
    expect(isWorkspaceUpdateActivity("task_assigned")).toBe(false);
    expect(isWorkspaceUpdateActivity("calendar_event_added")).toBe(false);
    expect(isWorkspaceUpdateActivity("member_joined")).toBe(false);
  });
});

describe("milestoneSubtitle", () => {
  test("describes the streak rather than a weekly total", () => {
    expect(milestoneSubtitle(10)).toBe("All completed on time, in a row.");
  });

  test("stays sensible when the count is missing", () => {
    expect(milestoneSubtitle(undefined)).toBe("An on-time streak in progress.");
  });
});

describe("nextMilestoneTarget", () => {
  test("follows the momentum thresholds of 5, 10 and 15", () => {
    expect(nextMilestoneTarget(0)).toBe(5);
    expect(nextMilestoneTarget(5)).toBe(10);
    expect(nextMilestoneTarget(10)).toBe(15);
  });

  test("moves in tens once the streak passes 15", () => {
    expect(nextMilestoneTarget(15)).toBe(20);
    expect(nextMilestoneTarget(20)).toBe(30);
    expect(nextMilestoneTarget(34)).toBe(40);
  });
});

describe("recognitionInvolvesWorkspaceMembers", () => {
  const members = new Set(["frank", "maya"]);

  test("requires both people to be on the workspace", () => {
    expect(recognitionInvolvesWorkspaceMembers("frank", "maya", members)).toBe(
      true,
    );
    expect(
      recognitionInvolvesWorkspaceMembers("frank", "outsider", members),
    ).toBe(false);
  });
});

describe("personalRecognitionToActivityEvent", () => {
  test("maps a sent recognition onto a celebration feed event", () => {
    const event = personalRecognitionToActivityEvent({
      id: "rec-1",
      createdAt: "2026-09-15T17:00:00.000Z",
      celebrationType: "teamwork",
      message: "Great shift",
      workspace: null,
      giver: { id: "frank", name: "Frank Lott", image: null },
      recipient: { id: "maya", name: "Maya Chen", image: null },
    });
    expect(event).toMatchObject({
      id: "rec-1",
      type: "celebration",
      metadata: {
        targetUserId: "maya",
        targetName: "Maya Chen",
        celebrationType: "teamwork",
        message: "Great shift",
      },
      user: { id: "frank", name: "Frank Lott" },
    });
  });
});

describe("formatFeedTimestamp", () => {
  test("uses compact units like the Updates mock", () => {
    expect(formatFeedTimestamp("2026-09-15T15:00:00.000Z", now)).toBe("2h");
    expect(formatFeedTimestamp("2026-09-15T16:40:00.000Z", now)).toBe("20m");
    expect(formatFeedTimestamp("2026-09-15T16:59:50.000Z", now)).toBe("now");
    expect(formatFeedTimestamp("2026-09-12T17:00:00.000Z", now)).toBe("3d");
  });

  test("stays relative instead of falling back to a date", () => {
    expect(formatFeedTimestamp("2026-08-29T17:00:00.000Z", now)).toBe("2w");
    expect(formatFeedTimestamp("2026-06-15T17:00:00.000Z", now)).toBe("3mo");
    expect(formatFeedTimestamp("2024-09-15T17:00:00.000Z", now)).toBe("2y");
  });
});

describe("workspaceUpdateHeadline", () => {
  test("leaves the author name to the header row", () => {
    expect(
      workspaceUpdateHeadline(
        feedItem({
          type: "celebration",
          title: "Jordan Lee",
          metadata: { targetName: "Jordan Lee" },
        }),
      ),
    ).toBe("Recognized Jordan Lee");
  });

  test("states the completed work", () => {
    expect(
      workspaceUpdateHeadline(
        feedItem({
          type: "task_completed",
          title: "Weekly safety walk",
          metadata: { taskTitle: "Weekly safety walk" },
        }),
      ),
    ).toBe("Completed Weekly safety walk");
  });
});

describe("workspaceUpdateBody", () => {
  test("uses the recognition note", () => {
    expect(
      workspaceUpdateBody(
        feedItem({
          type: "celebration",
          title: "Jordan Lee",
          metadata: {
            targetName: "Jordan Lee",
            message:
              "For stepping up and supporting the team during a busy shift.",
          },
        }),
      ),
    ).toBe("For stepping up and supporting the team during a busy shift.");
  });

  test("leaves completed work to the headline alone", () => {
    expect(
      workspaceUpdateBody(
        feedItem({
          type: "task_completed",
          title: "Weekly safety walk",
          actor: { id: "david", name: "David Kim", image: null },
          metadata: { taskTitle: "Weekly safety walk" },
        }),
      ),
    ).toBeNull();
  });
});

describe("totalReactionCount", () => {
  test("sums every emoji on the card", () => {
    expect(
      totalReactionCount({
        "❤️": { count: 5, userIds: [], users: [] },
        "🎉": { count: 3, userIds: [], users: [] },
      }),
    ).toBe(8);
  });

  test("reads zero for an untouched card", () => {
    expect(totalReactionCount(null)).toBe(0);
    expect(totalReactionCount({})).toBe(0);
  });
});

describe("hasReacted", () => {
  const reactions = {
    "❤️": { count: 1, userIds: ["frank"], users: [] },
  };

  test("tracks the signed-in reaction", () => {
    expect(hasReacted(reactions, "frank")).toBe(true);
    expect(hasReacted(reactions, "maya")).toBe(false);
    expect(hasReacted(reactions, undefined)).toBe(false);
  });
});

describe("recognitionParticipants", () => {
  test("reads both names for the identity line", () => {
    expect(
      recognitionParticipants(
        feedItem({
          type: "celebration",
          title: "Tyrell Lott",
          actor: { id: "frank", name: "Frank Lott", image: null },
          metadata: { targetName: "Tyrell Lott" },
        }),
      ),
    ).toEqual({ giverName: "Frank Lott", recipientName: "Tyrell Lott" });
  });

  test("falls back when a name is missing", () => {
    expect(
      recognitionParticipants(
        feedItem({ type: "celebration", title: "", actor: null, metadata: {} }),
      ),
    ).toEqual({ giverName: "Someone", recipientName: "a teammate" });
  });
});

describe("recognitionCategoryLabel", () => {
  const resolve = (key: string) =>
    key === "teamplayer" ? "Team Player" : null;

  test("uses the picker label when the category is known", () => {
    expect(recognitionCategoryLabel("teamplayer", resolve)).toBe("TEAM PLAYER");
  });

  test("falls back to the raw category words", () => {
    expect(recognitionCategoryLabel("customer_service", resolve)).toBe(
      "CUSTOMER SERVICE",
    );
  });

  test("omits the pill when there is no real category", () => {
    expect(recognitionCategoryLabel(null, resolve)).toBeNull();
    expect(recognitionCategoryLabel("   ", resolve)).toBeNull();
    expect(recognitionCategoryLabel("recognition", resolve)).toBeNull();
    expect(recognitionCategoryLabel("other", resolve)).toBeNull();
  });
});

describe("action labels", () => {
  test("stay empty until somebody engages", () => {
    expect(reactionActionLabel(0)).toBe("");
    expect(commentActionLabel(0)).toBe("");
  });

  test("show the count once people engage", () => {
    expect(reactionActionLabel(8)).toBe("8");
    expect(commentActionLabel(3)).toBe("3");
  });
});

describe("myReactionEmoji", () => {
  const reactions = {
    "🔥": {
      count: 1,
      userIds: ["frank"],
      users: [{ id: "frank", name: "Frank Lott" }],
    },
    "❤️": {
      count: 1,
      userIds: ["tyrell"],
      users: [{ id: "tyrell", name: "Tyrell Lott" }],
    },
  };

  test("reports the emoji the signed-in person left", () => {
    expect(myReactionEmoji(reactions, "frank")).toBe("🔥");
    expect(myReactionEmoji(reactions, "tyrell")).toBe("❤️");
  });

  test("reports nothing for a bystander or a signed-out reader", () => {
    expect(myReactionEmoji(reactions, "casey")).toBeNull();
    expect(myReactionEmoji(reactions, undefined)).toBeNull();
    expect(myReactionEmoji({}, "frank")).toBeNull();
  });
});

describe("applyReactionToggle", () => {
  const me = { id: "frank", name: "Frank Lott" };

  test("adds a reaction to an untouched card", () => {
    expect(applyReactionToggle({}, "❤️", me)).toEqual({
      "❤️": { count: 1, userIds: ["frank"], users: [me] },
    });
  });

  test("joins a reaction other people already left", () => {
    const existing = {
      "❤️": {
        count: 1,
        userIds: ["tyrell"],
        users: [{ id: "tyrell", name: "Tyrell Lott" }],
      },
    };
    expect(applyReactionToggle(existing, "❤️", me)["❤️"]).toEqual({
      count: 2,
      userIds: ["tyrell", "frank"],
      users: [{ id: "tyrell", name: "Tyrell Lott" }, me],
    });
  });

  test("tapping the same emoji takes the reaction back", () => {
    const existing = { "❤️": { count: 1, userIds: ["frank"], users: [me] } };
    expect(applyReactionToggle(existing, "❤️", me)).toEqual({});
  });

  test("a different emoji replaces my old one", () => {
    const existing = { "❤️": { count: 1, userIds: ["frank"], users: [me] } };
    expect(applyReactionToggle(existing, "🔥", me)).toEqual({
      "🔥": { count: 1, userIds: ["frank"], users: [me] },
    });
  });

  test("leaves other people's reactions alone", () => {
    const others = {
      "🎉": {
        count: 1,
        userIds: ["tyrell"],
        users: [{ id: "tyrell", name: "Tyrell Lott" }],
      },
    };
    expect(applyReactionToggle(others, "❤️", me)["🎉"]).toEqual(others["🎉"]);
  });
});
