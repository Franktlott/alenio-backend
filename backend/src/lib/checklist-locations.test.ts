import { describe, expect, test } from "bun:test";
import { buildSubmissionStats, checkPublicSubmissionRateLimit } from "./checklist-locations";

describe("checklist-locations lib", () => {
  test("buildSubmissionStats marks complete when all items checked", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = buildSubmissionStats(items, [
      { itemId: "a", checked: true },
      { itemId: "b", checked: true },
    ]);
    expect(result.isComplete).toBe(true);
    expect(result.checkedCount).toBe(2);
    expect(result.totalCount).toBe(2);
  });

  test("buildSubmissionStats ignores unknown item ids", () => {
    const items = [{ id: "a" }];
    const result = buildSubmissionStats(items, [
      { itemId: "a", checked: true },
      { itemId: "unknown", checked: true },
    ]);
    expect(result.checkedCount).toBe(1);
    expect(result.isComplete).toBe(true);
  });

  test("checkPublicSubmissionRateLimit allows then blocks", () => {
    const key = `test-${Date.now()}`;
    expect(checkPublicSubmissionRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkPublicSubmissionRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkPublicSubmissionRateLimit(key, 2, 60_000)).toBe(false);
  });
});
