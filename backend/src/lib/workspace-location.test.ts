import { describe, expect, test } from "bun:test";
import {
  WORKSPACE_LOCATION_MAX_LENGTH,
  normalizeWorkspaceLocation,
} from "./workspace-location";

describe("workspace location normalization", () => {
  test("trims values and clears blank or null values", () => {
    expect(normalizeWorkspaceLocation("  Austin, TX  ")).toEqual({
      ok: true,
      value: "Austin, TX",
    });
    expect(normalizeWorkspaceLocation("   ")).toEqual({ ok: true, value: null });
    expect(normalizeWorkspaceLocation(null)).toEqual({ ok: true, value: null });
  });

  test("rejects invalid types and overlong values", () => {
    expect(normalizeWorkspaceLocation(123).ok).toBe(false);
    expect(
      normalizeWorkspaceLocation("x".repeat(WORKSPACE_LOCATION_MAX_LENGTH + 1)).ok,
    ).toBe(false);
    expect(
      normalizeWorkspaceLocation("x".repeat(WORKSPACE_LOCATION_MAX_LENGTH)),
    ).toEqual({
      ok: true,
      value: "x".repeat(WORKSPACE_LOCATION_MAX_LENGTH),
    });
  });
});
