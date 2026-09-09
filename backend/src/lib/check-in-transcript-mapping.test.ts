import { describe, expect, test } from "bun:test";
import {
  normalizeTranscriptMapping,
  type MappableTemplateField,
} from "./check-in-transcript-mapping";

const fields: MappableTemplateField[] = [
  { id: "sec", label: "This week", type: "section", order: 0 },
  { id: "wins", label: "What went well?", type: "long_text", order: 1 },
  { id: "blockers", label: "Any blockers?", type: "short_text", order: 2 },
  { id: "mood", label: "How are you feeling?", type: "rating", order: 3, ratingMax: 5 },
  { id: "onTrack", label: "On track for the month?", type: "yes_no", order: 4 },
  { id: "notes", label: "Summary & commitments", type: "manager_notes", order: 5 },
  { id: "assoc", label: "Your notes", type: "associate_notes", order: 6 },
];

describe("normalizeTranscriptMapping", () => {
  test("keeps answers for known fields and trims text", () => {
    const result = normalizeTranscriptMapping(
      {
        responses: {
          wins: "  Closed the Ramirez account.  ",
          blockers: "Waiting on the new scanner.",
        },
      },
      fields,
    );
    expect(result.responses.wins).toBe("Closed the Ramirez account.");
    expect(result.responses.blockers).toBe("Waiting on the new scanner.");
  });

  test("drops field ids that are not in the template", () => {
    const result = normalizeTranscriptMapping(
      { responses: { wins: "Good week", madeUpField: "invented" } },
      fields,
    );
    expect(result.responses).toEqual({ wins: "Good week" });
  });

  test("never fills section or associate-notes fields", () => {
    const result = normalizeTranscriptMapping(
      { responses: { sec: "heading text", assoc: "speaking for the associate" } },
      fields,
    );
    expect(result.responses).toEqual({});
  });

  test("coerces ratings to whole numbers within ratingMax", () => {
    expect(normalizeTranscriptMapping({ responses: { mood: 3.6 } }, fields).responses.mood).toBe(4);
    expect(normalizeTranscriptMapping({ responses: { mood: "4" } }, fields).responses.mood).toBe(4);
    expect(normalizeTranscriptMapping({ responses: { mood: 9 } }, fields).responses.mood).toBe(5);
  });

  test("drops ratings that cannot be read as a number", () => {
    const result = normalizeTranscriptMapping(
      { responses: { mood: "pretty good honestly" } },
      fields,
    );
    expect(result.responses.mood).toBeUndefined();
    expect(result.unanswered).toContain("How are you feeling?");
  });

  test("normalizes yes/no answers and drops prose", () => {
    expect(normalizeTranscriptMapping({ responses: { onTrack: "Yes" } }, fields).responses.onTrack).toBe("yes");
    expect(normalizeTranscriptMapping({ responses: { onTrack: true } }, fields).responses.onTrack).toBe("yes");
    expect(normalizeTranscriptMapping({ responses: { onTrack: "N" } }, fields).responses.onTrack).toBe("no");
    expect(
      normalizeTranscriptMapping({ responses: { onTrack: "mostly, depends on staffing" } }, fields)
        .responses.onTrack,
    ).toBeUndefined();
  });

  test("drops empty strings and nested objects instead of saving junk", () => {
    const result = normalizeTranscriptMapping(
      { responses: { wins: "   ", blockers: { text: "nested" }, notes: null } },
      fields,
    );
    expect(result.responses).toEqual({});
  });

  test("reports every mappable question left unanswered", () => {
    const result = normalizeTranscriptMapping({ responses: { wins: "Good week" } }, fields);
    expect(result.unanswered).toEqual([
      "Any blockers?",
      "How are you feeling?",
      "On track for the month?",
      "Summary & commitments",
    ]);
  });

  test("survives a malformed or empty model response", () => {
    expect(normalizeTranscriptMapping(null, fields).responses).toEqual({});
    expect(normalizeTranscriptMapping({ responses: "not an object" }, fields).responses).toEqual({});
    expect(normalizeTranscriptMapping({}, fields).summary).toBe("");
  });

  test("trims and caps the summary", () => {
    const long = "x".repeat(5000);
    const result = normalizeTranscriptMapping({ summary: `  ${long}` }, fields);
    expect(result.summary.length).toBe(4000);
  });
});
