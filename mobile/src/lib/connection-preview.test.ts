import { describe, expect, test } from "bun:test";
import { selectConnectionPreview } from "./connection-preview";

type Candidate = {
  id: string;
  activeNow: boolean;
};

const candidate = (id: string, activeNow = false): Candidate => ({
  id,
  activeNow,
});

describe("selectConnectionPreview", () => {
  test("selects at most two active connections before ranked non-active entries", () => {
    const connections = [
      candidate("active-1", true),
      candidate("active-2", true),
      candidate("active-3", true),
      candidate("ranked-1"),
      candidate("ranked-2"),
      candidate("ranked-3"),
    ];

    expect(selectConnectionPreview(connections).map((entry) => entry.id)).toEqual([
      "active-1",
      "active-2",
      "ranked-1",
      "ranked-2",
      "ranked-3",
    ]);
  });

  test("uses the first six ranked non-active entries when nobody is active", () => {
    const connections = [
      candidate("ranked-1"),
      candidate("ranked-2"),
      candidate("ranked-3"),
      candidate("ranked-4"),
      candidate("ranked-5"),
      candidate("ranked-6"),
      candidate("ranked-7"),
    ];

    expect(selectConnectionPreview(connections).map((entry) => entry.id)).toEqual([
      "ranked-1",
      "ranked-2",
      "ranked-3",
      "ranked-4",
      "ranked-5",
      "ranked-6",
    ]);
  });

  test("preserves ordering within active and non-active groups", () => {
    const connections = [
      candidate("non-active-1"),
      candidate("active-1", true),
      candidate("non-active-2"),
      candidate("active-2", true),
      candidate("non-active-3"),
    ];

    expect(selectConnectionPreview(connections).map((entry) => entry.id)).toEqual([
      "active-1",
      "active-2",
      "non-active-1",
      "non-active-2",
      "non-active-3",
    ]);
  });

  test("returns all available entries without mutating the input", () => {
    const connections = [candidate("active", true), candidate("ranked")];
    const snapshot = [...connections];

    expect(selectConnectionPreview(connections)).toEqual(connections);
    expect(connections).toEqual(snapshot);
  });
});
