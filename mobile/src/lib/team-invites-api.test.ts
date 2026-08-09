import { describe, expect, test } from "bun:test";
import {
  isValidInviteEmail,
  teamInviteErrorMessage,
} from "./team-invite-errors";

describe("invite email validation", () => {
  test("accepts normal email addresses and rejects incomplete input", () => {
    expect(isValidInviteEmail("person@example.com")).toBe(true);
    expect(isValidInviteEmail("fg")).toBe(false);
  });
});

describe("teamInviteErrorMessage", () => {
  test("hides raw validation payloads", () => {
    const raw = new Error(
      JSON.stringify({
        origin: "string",
        code: "invalid_format",
        path: ["email"],
      }),
    );
    expect(teamInviteErrorMessage(raw)).toBe(
      "Enter a valid email address, like name@company.com.",
    );
  });

  test("uses a safe fallback for unknown technical errors", () => {
    expect(teamInviteErrorMessage(new Error('{"code":"INTERNAL"}'))).toBe(
      "We couldn't process this invitation. Please try again.",
    );
  });
});
