import { describe, expect, test } from "bun:test";
import { preferredTeamHealthTimeZone } from "./team-health-snapshots";

describe("preferredTeamHealthTimeZone", () => {
  test("prefers owner, then team leader, without treating legacy admin as leadership", () => {
    const members = [
      { role: "admin", user: { timezone: "America/Chicago" } },
      { role: "team_leader", user: { timezone: "America/Denver" } },
      { role: "owner", user: { timezone: "America/New_York" } },
    ];

    expect(preferredTeamHealthTimeZone(members)).toBe("America/New_York");
    expect(preferredTeamHealthTimeZone(members.slice(0, 2))).toBe(
      "America/Denver",
    );
  });
});
