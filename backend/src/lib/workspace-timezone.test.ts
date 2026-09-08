import { describe, expect, test } from "bun:test";
import {
  canChangeWorkspaceTimeZone,
  resolveWorkspaceTimeZone,
  validateWorkspaceTimeZone,
} from "./workspace-timezone";

describe("resolveWorkspaceTimeZone", () => {
  const members = [
    { role: "member", user: { timezone: "America/Chicago" } },
    { role: "team_leader", user: { timezone: "America/Denver" } },
    { role: "owner", user: { timezone: "America/New_York" } },
  ];

  test("prefers a valid team timezone", () => {
    expect(resolveWorkspaceTimeZone("Europe/London", members)).toBe("Europe/London");
  });

  test("falls back through owner, leader, first member, then UTC", () => {
    expect(resolveWorkspaceTimeZone(null, members)).toBe("America/New_York");
    expect(resolveWorkspaceTimeZone(null, members.slice(0, 2))).toBe("America/Denver");
    expect(resolveWorkspaceTimeZone(null, members.slice(0, 1))).toBe("America/Chicago");
    expect(resolveWorkspaceTimeZone(null, [])).toBe("UTC");
  });

  test("does not let invalid stored values block valid fallbacks", () => {
    expect(
      resolveWorkspaceTimeZone("not/a-zone", [
        { role: "owner", user: { timezone: "also-invalid" } },
        { role: "team_leader", user: { timezone: "Pacific/Auckland" } },
      ]),
    ).toBe("Pacific/Auckland");
    expect(
      resolveWorkspaceTimeZone(null, [
        { role: "owner", user: { timezone: "also-invalid" } },
        { role: "member", user: { timezone: "Asia/Tokyo" } },
      ]),
    ).toBe("Asia/Tokyo");
  });

  test("validates writes and reserves them for owners", () => {
    expect(canChangeWorkspaceTimeZone("owner")).toBe(true);
    expect(canChangeWorkspaceTimeZone("team_leader")).toBe(false);
    expect(validateWorkspaceTimeZone(" America/New_York ")).toEqual({
      ok: true,
      value: "America/New_York",
    });
    expect(validateWorkspaceTimeZone("EST-ish").ok).toBe(false);
  });
});
