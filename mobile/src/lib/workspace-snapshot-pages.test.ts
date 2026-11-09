import { describe, expect, test } from "bun:test";
import {
  bindSnapshotPageActions,
  buildSnapshotPages,
  countRecognitionThisWeek,
  percentBandLabel,
  workspacePulseBadgeCount,
  type SnapshotPagesInput,
} from "./workspace-snapshot-pages";

function input(overrides: Partial<SnapshotPagesInput> = {}): SnapshotPagesInput {
  return {
    isManager: true,
    dueToday: 12,
    overdue: 3,
    completedToday: 4,
    checkInsToday: 2,
    needsAttention: 3,
    momentumCount: 6,
    memberDevelopmentCount: 2,
    memberDevelopmentStatus: "on_track",
    memberMissingGoals: 0,
    health: 92,
    goalsOnTrackPct: 80,
    goalsRequired: true,
    onPressDueToday: () => {},
    onPressOverdue: () => {},
    onPressCompletedToday: () => {},
    onPressCheckIns: () => {},
    onPressNeedsAttention: () => {},
    onPressMomentum: () => {},
    onPressHealth: () => {},
    onPressGoals: () => {},
    ...overrides,
  };
}

function metric(pages: ReturnType<typeof buildSnapshotPages>, key: string) {
  const found = pages.flatMap((page) => page.metrics).find((m) => m.key === key);
  if (!found) throw new Error(`missing metric ${key}`);
  return found;
}

describe("buildSnapshotPages", () => {
  test("managers get one focused snapshot page", () => {
    const pages = buildSnapshotPages(input());
    expect(pages).toHaveLength(1);
    expect(pages.map((page) => page.key)).toEqual(["daily-operations"]);
    expect(pages[0].metrics).toHaveLength(3);
    expect(pages[0].metrics.map((metric) => metric.key)).toEqual([
      "tasks",
      "development",
      "momentum",
    ]);
  });

  test("members get their personal page", () => {
    const pages = buildSnapshotPages(input({ isManager: false }));
    expect(pages).toHaveLength(1);
    expect(pages[0].key).toBe("my-day");
    expect(pages[0].metrics.map((m) => m.key)).toEqual([
      "tasks",
      "development",
      "completed",
      "momentum",
    ]);
  });

  test("action tasks count overdue and due today together", () => {
    const tasks = metric(buildSnapshotPages(input({ isManager: false })), "tasks");
    expect(tasks.label).toBe("Needs Action");
    expect(tasks.value).toBe("15");
    expect(tasks.numericValue).toBe(15);
    expect(tasks.secondary).toMatchObject({ text: "3 Overdue", tone: "bad" });
    expect(typeof tasks.secondary?.onPress).toBe("function");
  });

  test("action tasks are unknown when either half is missing", () => {
    const tasks = metric(
      buildSnapshotPages(input({ isManager: false, overdue: null })),
      "tasks",
    );
    expect(tasks.value).toBe("—");
    expect(tasks.onPress).toBeUndefined();
  });

  test("empty states replace zero values with guidance copy", () => {
    const pages = buildSnapshotPages(
      input({
        dueToday: 0,
        overdue: 0,
        checkInsToday: 0,
        needsAttention: 0,
        goalsOnTrackPct: 0,
        completedToday: 0,
      }),
    );
    expect(metric(pages, "tasks").secondary).toBeUndefined();
    expect(metric(pages, "development")).toMatchObject({
      value: "0",
    });
    expect(metric(pages, "development").secondary).toBeUndefined();

    const memberPages = buildSnapshotPages(
      input({ isManager: false, memberDevelopmentCount: 0, completedToday: 0 }),
    );
    expect(metric(memberPages, "development").secondary?.text).toBe("On track");
    expect(metric(memberPages, "completed").secondary?.text).toBe("None yet today");
  });

  test("no app modules ship on the snapshot card yet", () => {
    const pages = buildSnapshotPages(input());
    expect(pages.flatMap((page) => page.metrics).some((m) => m.module)).toBe(
      false,
    );
  });

  test("momentum shows active task streaks and opens leader detail", () => {
    const momentum = metric(buildSnapshotPages(input()), "momentum");
    expect(momentum).toMatchObject({
      label: "Momentum",
      value: "6",
      numericValue: 6,
      secondary: { text: "Active task streaks", tone: "neutral" },
    });
    expect(typeof momentum.onPress).toBe("function");
  });

  test("member momentum shows the current task streak and development shows a member count", () => {
    expect(metric(buildSnapshotPages(input({ isManager: false, momentumCount: 4 })), "momentum"))
      .toMatchObject({
        value: "4",
        numericValue: 4,
        secondary: { text: "Current task streak", tone: "good" },
      });
    expect(metric(buildSnapshotPages(input({ goalsOnTrackPct: 80 })), "development"))
      .toMatchObject({ value: "3", numericValue: 3 });
    expect(metric(buildSnapshotPages(input()), "development").secondary).toBeUndefined();
  });

  test("member development prioritizes personal check-in and goal attention", () => {
    const checkIn = metric(
      buildSnapshotPages(
        input({
          isManager: false,
          memberDevelopmentStatus: "check_in_overdue",
        }),
      ),
      "development",
    );
    expect(checkIn.secondary).toEqual({
      text: "Needs attention",
      tone: "bad",
    });

    const goals = metric(
      buildSnapshotPages(
        input({
          isManager: false,
          memberDevelopmentStatus: "goals_missing",
          memberMissingGoals: 2,
        }),
      ),
      "development",
    );
    expect(goals.secondary).toEqual({
      text: "Needs attention",
      tone: "bad",
    });
  });

  test("null values render an em dash", () => {
    const pages = buildSnapshotPages(
      input({
        health: null,
        dueToday: null,
        needsAttention: null,
        momentumCount: null,
        goalsOnTrackPct: null,
      }),
    );
    const memberPages = buildSnapshotPages(input({ isManager: false, momentumCount: null }));
    expect(metric(memberPages, "momentum").value).toBe("—");
    expect(metric(memberPages, "momentum").onPress).toBeUndefined();
    expect(metric(memberPages, "momentum").secondary?.text).toBe("Not enough data");
    expect(metric(pages, "tasks").value).toBe("—");
    expect(metric(pages, "tasks").onPress).toBeUndefined();
    expect(metric(pages, "development").value).toBe("—");
    expect(metric(pages, "momentum").value).toBe("—");
    expect(metric(pages, "momentum").onPress).toBeUndefined();
  });

  test("development remains a single combined metric", () => {
    const development = metric(
      buildSnapshotPages(input({ goalsRequired: false, goalsOnTrackPct: null })),
      "development",
    );
    expect(development.value).toBe("3");
    expect(development.secondary).toBeUndefined();
    expect(typeof development.onPress).toBe("function");
  });

  test("member momentum is labelled and ready to build at zero", () => {
    const zeroPages = buildSnapshotPages(input({ isManager: false, momentumCount: 0 }));
    expect(metric(zeroPages, "momentum").secondary).toEqual({
      text: "Ready to build",
      tone: "neutral",
    });
    const pages = buildSnapshotPages(input({ isManager: false }));
    expect(metric(pages, "momentum").label).toBe("Momentum");
    expect(typeof metric(pages, "momentum").onPress).toBe("function");
  });

  test("manager pulse leaves member count to the Team tab", () => {
    const keys = buildSnapshotPages(input())
      .flatMap((page) => page.metrics)
      .map((metric) => metric.key);
    expect(keys).not.toContain("members");
  });
});

describe("percentBandLabel", () => {
  test("maps percentages to bands", () => {
    expect(percentBandLabel(null)).toBe("Not enough data");
    expect(percentBandLabel(85)).toBe("On Track");
    expect(percentBandLabel(84)).toBe("Watch");
    expect(percentBandLabel(59)).toBe("At Risk");
  });
});

describe("countRecognitionThisWeek", () => {
  // Wednesday; the local week starts Sunday Aug 2.
  const now = new Date(2026, 7, 5, 12, 0, 0);

  test("counts only celebrations inside the current week", () => {
    const count = countRecognitionThisWeek(
      [
        { type: "celebration", createdAt: new Date(2026, 7, 5, 9).toISOString() },
        { type: "celebration", createdAt: new Date(2026, 7, 2, 0, 1).toISOString() },
        { type: "celebration", createdAt: new Date(2026, 7, 1, 23).toISOString() },
        { type: "task_completed", createdAt: new Date(2026, 7, 4).toISOString() },
      ],
      now,
    );
    expect(count).toBe(2);
  });

  test("handles missing and malformed data", () => {
    expect(countRecognitionThisWeek(undefined, now)).toBe(0);
    expect(countRecognitionThisWeek([], now)).toBe(0);
    expect(
      countRecognitionThisWeek([{ type: "celebration", createdAt: "nope" }], now),
    ).toBe(0);
  });
});

describe("workspacePulseBadgeCount", () => {
  test("follows the selected workspace attention signal", () => {
    expect(
      workspacePulseBadgeCount({
        isManager: true,
        overdue: 4,
        needsAttention: 1,
      }),
    ).toBe(1);
    expect(
      workspacePulseBadgeCount({
        isManager: false,
        overdue: 4,
        needsAttention: 1,
      }),
    ).toBe(4);
    expect(
      workspacePulseBadgeCount({
        isManager: true,
        overdue: null,
        needsAttention: null,
      }),
    ).toBe(0);
  });
});

describe("bindSnapshotPageActions", () => {
  test("wraps metric and secondary presses", () => {
    let ran = 0;
    const pages = bindSnapshotPageActions(
      buildSnapshotPages(input({ isManager: false })),
      () => () => {
        ran += 1;
      },
    );
    pages[0].metrics[0].onPress?.();
    pages[0].metrics[0].secondary?.onPress?.();
    expect(ran).toBe(2);
  });
});
