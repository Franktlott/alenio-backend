import { describe, expect, test } from "bun:test";
import {
  checkInLibraryCategory,
  checkInLibraryDescription,
  filterCheckInLibrary,
  filterCheckInLibraryByCategory,
  filterCheckInTemplates,
  sortCheckInLibrary,
  sortCheckInTemplates,
} from "./check-in-template-directory";
import type {
  CheckInLibraryTemplate,
  CheckInTemplate,
} from "./check-in-templates-api";
import type { OneOnOneTemplateField } from "./member-profile-api";

function questions(count: number): OneOnOneTemplateField[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `field-${index}`,
    label: `Question ${index + 1}`,
    type: "short_text" as const,
    order: index,
  }));
}

function template(
  over: Partial<CheckInTemplate> & { title: string },
): CheckInTemplate {
  return {
    id: over.title,
    description: null,
    fields: questions(2),
    leaderPrep: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as CheckInTemplate;
}

function libraryTemplate(
  over: Partial<CheckInLibraryTemplate> & { title: string },
): CheckInLibraryTemplate {
  return {
    key: over.title.toLowerCase(),
    description: null,
    fields: questions(2),
    ...over,
  };
}

describe("filterCheckInTemplates", () => {
  const list = [
    template({ title: "Weekly Check-In", description: "Regular team sync" }),
    template({ title: "Quarterly Review", description: "Goals and growth" }),
  ];

  test("returns everything for an empty query", () => {
    expect(filterCheckInTemplates(list, "   ")).toHaveLength(2);
  });

  test("matches title and description, ignoring case", () => {
    expect(filterCheckInTemplates(list, "weekly").map((t) => t.title)).toEqual([
      "Weekly Check-In",
    ]);
    expect(filterCheckInTemplates(list, "GROWTH").map((t) => t.title)).toEqual([
      "Quarterly Review",
    ]);
  });

  test("returns nothing when there is no match", () => {
    expect(filterCheckInTemplates(list, "safety")).toHaveLength(0);
  });
});

describe("sortCheckInTemplates", () => {
  const older = template({
    title: "Alpha",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fields: questions(5),
  });
  const newer = template({
    title: "Zulu",
    updatedAt: "2026-03-01T00:00:00.000Z",
    fields: questions(1),
  });

  test("recent puts the newest update first", () => {
    expect(sortCheckInTemplates([older, newer], "recent").map((t) => t.title)).toEqual([
      "Zulu",
      "Alpha",
    ]);
  });

  test("name sorts alphabetically", () => {
    expect(sortCheckInTemplates([newer, older], "name").map((t) => t.title)).toEqual([
      "Alpha",
      "Zulu",
    ]);
  });

  test("questions sorts by question count, then name", () => {
    const tie = template({ title: "Bravo", fields: questions(5) });
    expect(
      sortCheckInTemplates([newer, tie, older], "questions").map((t) => t.title),
    ).toEqual(["Alpha", "Bravo", "Zulu"]);
  });

  test("leaves the input array untouched", () => {
    const input = [newer, older];
    sortCheckInTemplates(input, "name");
    expect(input.map((t) => t.title)).toEqual(["Zulu", "Alpha"]);
  });

  test("treats an unparseable timestamp as oldest", () => {
    const broken = template({ title: "Broken", updatedAt: "not-a-date" });
    expect(
      sortCheckInTemplates([broken, newer], "recent").map((t) => t.title),
    ).toEqual(["Zulu", "Broken"]);
  });
});

describe("library helpers", () => {
  const library = [
    libraryTemplate({ title: "Weekly Check-In", fields: questions(3) }),
    libraryTemplate({ title: "Career Growth", description: "Long-term plans" }),
  ];

  test("filters on title and description", () => {
    expect(filterCheckInLibrary(library, "career").map((t) => t.title)).toEqual([
      "Career Growth",
    ]);
    expect(filterCheckInLibrary(library, "long-term")).toHaveLength(1);
  });

  test("falls back to name order because the library has no timestamps", () => {
    expect(sortCheckInLibrary(library, "recent").map((t) => t.title)).toEqual([
      "Career Growth",
      "Weekly Check-In",
    ]);
  });

  test("groups the built-in library by category", () => {
    const builtIn = [
      libraryTemplate({ key: "coaching-conversation", title: "Coaching Conversation" }),
      libraryTemplate({ key: "feedback-conversation", title: "Feedback Conversation" }),
      libraryTemplate({ key: "development-check-in", title: "Development Check-In" }),
      libraryTemplate({ key: "career-conversation", title: "Career Conversation" }),
      libraryTemplate({ key: "new-hire-30-60-90", title: "New Hire 30/60/90" }),
      libraryTemplate({ key: "first-week-check-in", title: "First Week Check-In" }),
      libraryTemplate({ key: "weekly-check-in", title: "Weekly Check-In" }),
      libraryTemplate({ key: "monthly-check-in", title: "Monthly Check-In" }),
    ];
    expect(builtIn.map(checkInLibraryCategory)).toEqual([
      "Coaching",
      "Coaching",
      "Development",
      "Development",
      "Onboarding",
      "Onboarding",
      "Team",
      "Team",
    ]);
    expect(filterCheckInLibraryByCategory(builtIn, "All")).toHaveLength(8);
    expect(
      filterCheckInLibraryByCategory(builtIn, "Onboarding").map((item) => item.key),
    ).toEqual(["new-hire-30-60-90", "first-week-check-in"]);
    expect(checkInLibraryDescription(builtIn[4])).toBe(
      "Build a consistent onboarding experience for new hires.",
    );
  });

  test("still supports sorting by question count", () => {
    expect(sortCheckInLibrary(library, "questions").map((t) => t.title)).toEqual([
      "Weekly Check-In",
      "Career Growth",
    ]);
  });
});
