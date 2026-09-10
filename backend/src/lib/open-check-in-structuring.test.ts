import { describe, expect, test } from "bun:test";
import {
  normalizeOpenCheckIn,
  openCheckInRecapField,
  OPEN_CHECK_IN_MAX_ITEMS,
  OPEN_CHECK_IN_RECAP_FIELD_ID,
  OPEN_CHECK_IN_TITLE,
} from "./open-check-in-structuring";

describe("normalizeOpenCheckIn", () => {
  test("folds topics into one recap of questions and answers", () => {
    const result = normalizeOpenCheckIn({
      title: "Weekly catch-up",
      items: [
        { question: "How is the new route going?", answer: "  Settled in now.  " },
        { question: "Any blockers?", answer: "Waiting on the scanner." },
      ],
      summary: "Route is settled. Scanner still outstanding.",
    });

    expect(result.title).toBe("Weekly catch-up");
    expect(result.recap).toBe(
      "How is the new route going?\nSettled in now.\n\nAny blockers?\nWaiting on the scanner.",
    );
    expect(result.summary).toBe("Route is settled. Scanner still outstanding.");
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

    expect(result.recap).toBe("Kept?\nYes.");
  });

  test("caps the number of topics", () => {
    const result = normalizeOpenCheckIn({
      items: Array.from({ length: OPEN_CHECK_IN_MAX_ITEMS + 5 }, (_, index) => ({
        question: `Question ${index}?`,
        answer: `Answer ${index}`,
      })),
    });

    expect(result.recap.split("\n\n")).toHaveLength(OPEN_CHECK_IN_MAX_ITEMS);
  });

  test("falls back to a usable title and empty recap", () => {
    expect(normalizeOpenCheckIn(null).title).toBe(OPEN_CHECK_IN_TITLE);
    expect(normalizeOpenCheckIn({ title: "   " }).title).toBe(OPEN_CHECK_IN_TITLE);
    expect(normalizeOpenCheckIn(undefined).recap).toBe("");
    expect(normalizeOpenCheckIn({ items: "nope" }).recap).toBe("");
    expect(normalizeOpenCheckIn({}).summary).toBe("");
  });
});

describe("openCheckInRecapField", () => {
  test("is a single optional long text question", () => {
    const field = openCheckInRecapField();
    expect(field.id).toBe(OPEN_CHECK_IN_RECAP_FIELD_ID);
    expect(field.type).toBe("long_text");
    expect(field.required).toBe(false);
    expect(field.order).toBe(0);
  });
});
