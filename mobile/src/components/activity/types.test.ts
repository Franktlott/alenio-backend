import { describe, expect, test } from "bun:test";
import {
  groupActivitiesByDate,
  groupRepetitiveActivities,
  isImportantActivity,
  matchesActivityFilter,
  matchesActivitySearch,
  type ActivityFeedItem,
  type ActivityFeedType,
} from "./types";

function item(
  id: string,
  type: ActivityFeedType,
  overrides: Partial<ActivityFeedItem> = {},
): ActivityFeedItem {
  return {
    id,
    teamId: "team-1",
    teamName: "Wawa #5101",
    type,
    actor: { id: "user-1", name: "Frank Lott", image: null },
    title: "Activity update",
    description: "Frank completed Activity update",
    timestamp: "2026-07-29T14:00:00.000Z",
    dateGroup: "today",
    metadata: { taskTitle: "Activity update" },
    reactions: {},
    ...overrides,
  };
}

describe("activity feed helpers", () => {
  test("maps Updates filter to recognition and milestone activity", () => {
    expect(matchesActivityFilter("celebration", "updates")).toBe(true);
    expect(matchesActivityFilter("personal_best", "updates")).toBe(true);
    expect(matchesActivityFilter("task_completed", "updates")).toBe(false);
  });

  test("finds activity using actor, workspace, and item copy", () => {
    const activity = item("1", "task_completed");
    expect(matchesActivitySearch(activity, "frank")).toBe(true);
    expect(matchesActivitySearch(activity, "wawa")).toBe(true);
    expect(matchesActivitySearch(activity, "missing")).toBe(false);
  });

  test("marks recognition and late completion metadata important", () => {
    expect(isImportantActivity(item("1", "celebration"))).toBe(true);
    expect(
      isImportantActivity(
        item("2", "task_completed", { metadata: { completedOnTime: false } }),
      ),
    ).toBe(true);
    expect(isImportantActivity(item("3", "task_completed"))).toBe(false);
  });

  test("groups same actor and activity type within one hour", () => {
    const grouped = groupRepetitiveActivities([
      item("1", "task_completed", { timestamp: "2026-07-29T14:00:00.000Z" }),
      item("2", "task_completed", { timestamp: "2026-07-29T13:20:00.000Z" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.type).toBe("group");
    if (grouped[0]?.type === "group") {
      expect(grouped[0].items.map((entry) => entry.id)).toEqual(["1", "2"]);
      expect(grouped[0].title).toContain("2 tasks");
    }
  });

  test("does not group across workspaces", () => {
    const grouped = groupRepetitiveActivities([
      item("1", "task_completed"),
      item("2", "task_completed", { teamId: "team-2" }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  test("creates separate calendar-date sections", () => {
    const sections = groupActivitiesByDate([
      item("1", "task_completed", { timestamp: "2026-07-29T14:00:00.000Z" }),
      item("2", "task_completed", { timestamp: "2026-07-28T14:00:00.000Z" }),
    ]);
    expect(sections).toHaveLength(2);
  });
});
