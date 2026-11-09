import { describe, expect, test } from "bun:test";
import { workspaceCreationErrorMessage } from "@/lib/workspace-creation-errors";

function apiError(code: string): Error {
  return Object.assign(new Error("raw"), { body: { error: { code } } });
}

describe("workspace creation errors", () => {
  test("explains exhausted trial eligibility", () => {
    const error = apiError("TRIAL_ALREADY_USED");
    expect(workspaceCreationErrorMessage(error)).toContain("Choose a paid plan");
  });

  test("explains checkout configuration failures", () => {
    const error = apiError("NOT_CONFIGURED");
    expect(workspaceCreationErrorMessage(error)).toContain("temporarily unavailable");
  });
});
