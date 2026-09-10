import { describe, expect, test } from "bun:test";
import {
  normalizeOpenCheckIn,
  OPEN_CHECK_IN_MAX_ITEMS,
  OPEN_CHECK_IN_TITLE,
} from "./open-check-in-structuring";

describe("normalizeOpenCheckIn", () => {
  test("turns topics into ordered questions with matching answers", () => {
    const result = normalizeOpenCheckIn({
      title: "Weekly catch-up",
      items: [
        { question: "How is the new route going?", answer: "  Settled in now.  " },
        { question: "Any blockers?", answer: "Waiting on the scanner." },
      ],
      summary: "Route is settled. Scanner still outstanding.",
    });

    expect(result.title).toBe("Weekly catch-up");
    expect(result.fields.map((field) => field.label)).toEqual([
      "How is the new route going?",
      "Any blockers?",
    ]);
    expect(result.fields.map((field) => field.order)).toEqual([0, 1]);
    expect(result.fields.every((field) => field.type === "long_text")).toBe(true);
    expect(result.responses[result.fields[0]!.id]).toBe("Settled in now.");
    expect(result.responses[result.fields[1]!.id]).toBe("Waiting on the scanner.");
    expect(result.summary).toBe("Route is settled. Scanner still outstanding.");
  });

  test("assigns its own ids so a repeated model id cannot merge two answers", () => {
    const result = normalizeOpenCheckIn({
      items: [
        { question: "First?", answer: "One." },
        { question: "Second?", answer: "Two." },
      ],
    });

    const ids = result.fields.map((field) => field.id);
    expect(new Set(ids).size).toBe(2);
    expect(Object.keys(result.responses).sort()).toEqual([...ids].sort());
  });

  test("drops topics with no question or no answer", () => {
    const result = normalizeOpenCheckIn({
      items: [
        { question: "Kept?", answer: "Yes." },
        { question: "  ", answer: "Orphan answer." },
        { question: "No answer?", answer: "   " },
        "not an object",
        null,
      ],
    });

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]!.label).toBe("Kept?");
  });

  test("caps the number of topics", () => {
    const result = normalizeOpenCheckIn({
      items: Array.from({ length: OPEN_CHECK_IN_MAX_ITEMS + 5 }, (_, index) => ({
        question: `Question ${index}?`,
        answer: `Answer ${index}`,
      })),
    });

    expect(result.fields).toHaveLength(OPEN_CHECK_IN_MAX_ITEMS);
  });

  test("falls back to a usable title and empty structure", () => {
    expect(normalizeOpenCheckIn(null).title).toBe(OPEN_CHECK_IN_TITLE);
    expect(normalizeOpenCheckIn({ title: "   " }).title).toBe(OPEN_CHECK_IN_TITLE);
    expect(normalizeOpenCheckIn(undefined).fields).toEqual([]);
    expect(normalizeOpenCheckIn({ items: "nope" }).responses).toEqual({});
    expect(normalizeOpenCheckIn({}).summary).toBe("");
  });
});
