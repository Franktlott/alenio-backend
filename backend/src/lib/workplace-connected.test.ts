import { describe, expect, test } from "bun:test";
import { isWorkplaceConnected, serializeWorkplaceConnectedUser } from "./workplace-connected";

describe("Workplace Connected", () => {
  test("is false with no active workspace memberships", () => {
    expect(isWorkplaceConnected({ _count: { teamMembers: 0 } })).toBe(false);
  });

  test("is true with one active workspace membership", () => {
    expect(isWorkplaceConnected({ _count: { teamMembers: 1 } })).toBe(true);
  });

  test("remains binary with multiple memberships", () => {
    expect(isWorkplaceConnected({ _count: { teamMembers: 10 } })).toBe(true);
  });

  test("serializes the derived state without leaking the count", () => {
    expect(
      serializeWorkplaceConnectedUser({
        id: "user-1",
        name: "Taylor",
        _count: { teamMembers: 2 },
      }),
    ).toEqual({
      id: "user-1",
      name: "Taylor",
      isWorkplaceConnected: true,
    });
  });
});
