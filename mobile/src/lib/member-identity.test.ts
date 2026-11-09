import { describe, expect, test } from "bun:test";
import { isLeaderRole } from "./member-identity";

describe("isLeaderRole", () => {
  test("limits canonical coaching management to owners and team leaders", () => {
    expect(isLeaderRole("owner")).toBe(true);
    expect(isLeaderRole("team_leader")).toBe(true);
    expect(isLeaderRole("admin")).toBe(false);
    expect(isLeaderRole("member")).toBe(false);
  });
});
