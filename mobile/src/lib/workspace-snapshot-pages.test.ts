import { describe, expect, test } from "bun:test";
import {
  buildSnapshotPages,
  countRecognitionThisWeek,
  percentBandLabel,
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
    health: 92,
    recognitionThisWeek: 5,
    goalsOnTrackPct: 80,
    onPressDueToday: () => {},
    onPressOverdue: () => {},
    onPressCompletedToday: () => {},
    onPressCheckIns: () => {},
    onPressNeedsAttention: () => {},
    onPressHealth: () => {},
    onPressRecognition: () => {},
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
  test("managers get two pages of exactly four metrics", () => {
    const pages = buildSnapshotPages(input());
    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.key)).toEqual(["daily-operations", "leadership"]);
    for (const page of pages) expect(page.metrics).toHaveLength(4);
  });

  test("members get a single personal page", () => {
    const pages = buildSnapshotPages(input({ isManager: false }));
    expect(pages).toHaveLength(1);
    expect(pages[0].key).toBe("my-day");
    expect(pages[0].metrics.map((m) => m.key)).toEqual([
      "tasks",
      "checkins",
      "completed",
      "health",
    ]);
  });

  test("tasks surface overdue as a pressable red secondary line", () => {
    const tasks = metric(buildSnapshotPages(input()), "tasks");
    expect(tasks.value).toBe("12");
    expect(tasks.numericValue).toBe(12);
    expect(tasks.secondary).toMatchObject({ text: "3 Overdue", tone: "bad" });
    expect(typeof tasks.secondary?.onPress).toBe("function");
  });

  test("empty states replace zero values with guidance copy", () => {
    const pages = buildSnapshotPages(
      input({
        dueToday: 0,
        overdue: 0,
        checkInsToday: 0,
        needsAttention: 0,
        recognitionThisWeek: 0,
        completedToday: 0,
      }),
    );
    expect(metric(pages, "tasks").secondary?.text).toBe("Nothing assigned");
    expect(metric(pages, "checkins").secondary?.text).toBe("None today");
    expect(metric(pages, "team").secondary).toMatchObject({
      text: "All caught up",
      tone: "good",
    });
    expect(metric(pages, "recognition").secondary?.text).toBe("None yet");

    const memberPages = buildSnapshotPages(
      input({ isManager: false, completedToday: 0 }),
    );
    expect(metric(memberPages, "completed").secondary?.text).toBe("None yet today");
  });

  test("briefings and temps render as non-pressable coming soon cards", () => {
    const pages = buildSnapshotPages(input());
    for (const key of ["briefings", "temps"]) {
      const card = metric(pages, key);
      expect(card.comingSoon).toBe(true);
      expect(card.value).toBe("—");
      expect(card.onPress).toBeUndefined();
      expect(card.secondary?.text).toBe("Coming soon");
    }
  });

  test("health and goals use the same tone bands", () => {
    expect(metric(buildSnapshotPages(input({ health: 92 })), "health").secondary)
      .toMatchObject({ text: "On Track", tone: "good" });
    expect(metric(buildSnapshotPages(input({ health: 70 })), "health").secondary)
      .toMatchObject({ text: "Watch", tone: "warn" });
    expect(metric(buildSnapshotPages(input({ health: 40 })), "health").secondary)
      .toMatchObject({ text: "At Risk", tone: "bad" });
    expect(metric(buildSnapshotPages(input({ goalsOnTrackPct: 80 })), "goals"))
      .toMatchObject({ value: "80%", numericValue: 80, valueSuffix: "%" });
  });

  test("null values render an em dash and drop their tap target", () => {
    const pages = buildSnapshotPages(
      input({ health: null, dueToday: null, needsAttention: null, goalsOnTrackPct: null }),
    );
    expect(metric(pages, "health").value).toBe("—");
    expect(metric(pages, "health").onPress).toBeUndefined();
    expect(metric(pages, "health").secondary?.text).toBe("Not enough data");
    expect(metric(pages, "tasks").value).toBe("—");
    expect(metric(pages, "tasks").onPress).toBeUndefined();
    expect(metric(pages, "goals").onPress).toBeUndefined();
  });

  test("member health is labelled personally", () => {
    const pages = buildSnapshotPages(input({ isManager: false }));
    expect(metric(pages, "health").label).toBe("My Health");
    expect(metric(buildSnapshotPages(input()), "health").label).toBe("Workspace Health");
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
