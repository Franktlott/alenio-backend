import { describe, expect, test } from "bun:test";
import { cleanFeatures, describePlanEdit, formatPlanPrice, planPeriodLabel } from "./billing-plans";

describe("formatPlanPrice", () => {
  test("shows cents only when there are any", () => {
    expect(formatPlanPrice(3999)).toBe("$39.99");
    expect(formatPlanPrice(4000)).toBe("$40");
    expect(formatPlanPrice(129900)).toBe("$1,299");
  });

  test("labels the billing period", () => {
    expect(planPeriodLabel("month")).toBe("per workspace / month");
    expect(planPeriodLabel("year")).toBe("per workspace / year");
  });
});

describe("cleanFeatures", () => {
  test("trims, drops blanks and repeats, and keeps order", () => {
    expect(cleanFeatures(["  Tasks ", "", "Chat", "tasks", "   "])).toEqual(["Tasks", "Chat"]);
  });

  test("caps the list at 14 items", () => {
    expect(cleanFeatures(Array.from({ length: 20 }, (_, i) => `Feature ${i}`))).toHaveLength(14);
  });
});

describe("describePlanEdit", () => {
  const before = {
    name: "Pro",
    bestFor: "Teams",
    priceCents: 3999,
    currency: "usd",
    comingSoon: false,
    features: ["Tasks"],
  };

  test("says what happens to existing subscribers on a price change", () => {
    expect(describePlanEdit(before, { ...before, priceCents: 4999 }, "keep")).toBe(
      "Changed price $39.99 → $49.99 (existing subscribers keep their price)",
    );
    expect(describePlanEdit(before, { ...before, priceCents: 2999 }, "move")).toBe(
      "Changed price $39.99 → $29.99 (existing subscribers move at their next bill)",
    );
  });

  test("lists copy changes", () => {
    expect(describePlanEdit(before, { ...before, name: "Team", features: ["Tasks", "Chat"] }, null)).toBe(
      "Changed name “Pro” → “Team”, extra pricing lines",
    );
    expect(describePlanEdit(before, { ...before }, null)).toBe("No changes");
  });

  test("names availability changes", () => {
    expect(describePlanEdit(before, { ...before, comingSoon: true }, null)).toBe("Changed marked coming soon");
    expect(describePlanEdit({ ...before, comingSoon: true }, { ...before, comingSoon: false }, null)).toBe(
      "Changed marked available",
    );
  });

  test("names features switched on or off", () => {
    expect(
      describePlanEdit(
        { ...before, included: ["workspace", "seneca"] },
        { ...before, included: ["workspace", "go_walks"] },
        null,
      ),
    ).toBe("Changed added Guided walks, removed Seneca AI coaching assistant");
  });
});
