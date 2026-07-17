import { describe, expect, test } from "bun:test";
import {
  findIncompleteRequiredItems,
  flattenSnapshotItems,
  scoreWalkRun,
} from "./walk-run-service";

const snapshot = {
  id: "t1",
  name: "Cooler Walk",
  description: null,
  workplace: "floor",
  scoringEnabled: true,
  version: 1,
  sections: [
    {
      id: "s1",
      title: "Coolers",
      description: null,
      position: 0,
      items: [
        {
          id: "i1",
          sectionId: "s1",
          type: "TEMPERATURE",
          title: "Cooler A",
          description: null,
          instructions: null,
          position: 0,
          required: true,
          config: {},
        },
        {
          id: "i2",
          sectionId: "s1",
          type: "YES_NO",
          title: "Door sealed",
          description: null,
          instructions: null,
          position: 1,
          required: true,
          config: {},
        },
      ],
    },
  ],
  unsectionedItems: [
    {
      id: "i3",
      sectionId: null,
      type: "PHOTO",
      title: "Photo evidence",
      description: null,
      instructions: null,
      position: 0,
      required: false,
      config: {},
    },
  ],
};

describe("flattenSnapshotItems", () => {
  test("orders section items then loose items", () => {
    const items = flattenSnapshotItems(snapshot);
    expect(items.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
  });
});

describe("findIncompleteRequiredItems", () => {
  test("blocks completion when required item is NOT_STARTED", () => {
    const items = flattenSnapshotItems(snapshot);
    const incomplete = findIncompleteRequiredItems(items, [
      { itemId: "i1", status: "PASS" },
      { itemId: "i2", status: "NOT_STARTED" },
    ]);
    expect(incomplete.map((i) => i.id)).toEqual(["i2"]);
  });

  test("blocks completion when required item needs action", () => {
    const items = flattenSnapshotItems(snapshot);
    const incomplete = findIncompleteRequiredItems(items, [
      { itemId: "i1", status: "NEEDS_ACTION" },
      { itemId: "i2", status: "PASS" },
    ]);
    expect(incomplete.map((i) => i.id)).toEqual(["i1"]);
  });

  test("allows completion when required items answered (fails ok)", () => {
    const items = flattenSnapshotItems(snapshot);
    const incomplete = findIncompleteRequiredItems(items, [
      { itemId: "i1", status: "FAIL" },
      { itemId: "i2", status: "PASS" },
    ]);
    expect(incomplete).toEqual([]);
  });
});

describe("scoreWalkRun", () => {
  test("scores pass rate across scorable answered items", () => {
    const items = flattenSnapshotItems(snapshot);
    expect(
      scoreWalkRun(items, [
        { itemId: "i1", status: "PASS" },
        { itemId: "i2", status: "FAIL" },
        { itemId: "i3", status: "PASS" },
      ]),
    ).toBe(67);
  });
});
