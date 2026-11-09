import { describe, expect, test } from "bun:test";
import { connectionRequestErrorMessage } from "./connection-request-error";

describe("connectionRequestErrorMessage", () => {
  test("explains declined-request cooldowns with retry metadata", () => {
    const error = Object.assign(new Error("cooldown"), {
      body: { error: {
        code: "CONNECTION_REQUEST_COOLDOWN",
        retryAt: "2026-08-15T12:00:00.000Z",
      } },
    });
    expect(connectionRequestErrorMessage(error)).toContain("Aug 15");
  });

  test("preserves ordinary API messages", () => {
    expect(connectionRequestErrorMessage(new Error("Blocked"))).toBe("Blocked");
  });
});
