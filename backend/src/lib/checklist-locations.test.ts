import { describe, expect, test } from "bun:test";
import {
  buildSubmissionStats,
  checkPublicSubmissionRateLimit,
  validateSignedResponses,
} from "./checklist-locations";

describe("checklist-locations lib", () => {
  test("buildSubmissionStats marks complete when all items checked with signers", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = buildSubmissionStats(items, [
      { itemId: "a", checked: true, signerName: "Alex" },
      { itemId: "b", checked: true, signerName: "Jordan" },
    ]);
    expect(result.isComplete).toBe(true);
    expect(result.checkedCount).toBe(2);
    expect(result.submitterNames).toEqual(["Alex", "Jordan"]);
  });

  test("validateSignedResponses requires signer name on checked items", () => {
    const items = [{ id: "a" }];
    expect(
      validateSignedResponses(items, [{ itemId: "a", checked: true, signerName: null }]),
    ).toContain("sign off");
    expect(validateSignedResponses(items, [{ itemId: "a", checked: true, signerName: "Sam" }])).toBeNull();
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
