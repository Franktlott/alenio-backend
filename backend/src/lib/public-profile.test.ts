import { describe, expect, test } from "bun:test";
import {
  countMutualConnections,
  validatePublicProfileUpdate,
} from "./public-profile";

describe("validatePublicProfileUpdate", () => {
  test("normalizes websites and converts blank fields to null", () => {
    expect(
      validatePublicProfileUpdate({
        profileWebsite: " alenio.com/about ",
        profileLocation: null,
        profileBio: " Builds reliable teams. ",
      }),
    ).toEqual({
      ok: true,
      data: {
        profileWebsite: "https://alenio.com/about",
        profileLocation: null,
        profileBio: "Builds reliable teams.",
      },
    });
  });

  test("upgrades HTTP and clears a blank website", () => {
    expect(validatePublicProfileUpdate({ profileWebsite: "http://example.com/team" })).toEqual({
      ok: true,
      data: { profileWebsite: "https://example.com/team" },
    });
    expect(validatePublicProfileUpdate({ profileWebsite: " " })).toEqual({
      ok: true,
      data: { profileWebsite: null },
    });
  });

  test("rejects invalid, unsafe, non-text, and over-limit fields", () => {
    expect(validatePublicProfileUpdate({ profileLocation: 42 })).toEqual({
      ok: false,
      message: "profileLocation must be text.",
    });
    expect(validatePublicProfileUpdate({ profileWebsite: "javascript:alert(1)" })).toEqual({
      ok: false,
      message: "profileWebsite must be a valid website.",
    });
    expect(validatePublicProfileUpdate({ profileWebsite: "localhost:3000" })).toEqual({
      ok: false,
      message: "profileWebsite must be a valid website.",
    });
    expect(
      validatePublicProfileUpdate({
        profileWebsite: `https://example.com/${"x".repeat(2030)}`,
      }),
    ).toEqual({
      ok: false,
      message: "profileWebsite must be 2048 characters or fewer.",
    });
  });
});

describe("validatePublicProfileUpdate: profileTitle", () => {
  test("trims a title and keeps it", () => {
    const result = validatePublicProfileUpdate({ profileTitle: "  Operations Manager  " });
    expect(result).toEqual({ ok: true, data: { profileTitle: "Operations Manager" } });
  });

  test("stores an empty title as null", () => {
    const result = validatePublicProfileUpdate({ profileTitle: "   " });
    expect(result).toEqual({ ok: true, data: { profileTitle: null } });
  });

  test("rejects a title over the limit", () => {
    const result = validatePublicProfileUpdate({ profileTitle: "x".repeat(81) });
    expect(result.ok).toBe(false);
  });

  test("ignores a title that was not sent", () => {
    expect(validatePublicProfileUpdate({})).toEqual({ ok: true, data: {} });
  });
});

describe("countMutualConnections", () => {
  test("counts accepted people shared by viewer and profile owner", () => {
    expect(
      countMutualConnections(
        "viewer",
        "person",
        [
          { requesterId: "viewer", recipientId: "mutual-a" },
          { requesterId: "viewer-only", recipientId: "viewer" },
          { requesterId: "mutual-b", recipientId: "viewer" },
        ],
        [
          { requesterId: "person", recipientId: "mutual-a" },
          { requesterId: "mutual-b", recipientId: "person" },
          { requesterId: "person", recipientId: "person-only" },
        ],
      ),
    ).toBe(2);
  });

  test("does not count the viewer or duplicate rows", () => {
    expect(
      countMutualConnections(
        "viewer",
        "person",
        [{ requesterId: "viewer", recipientId: "mutual" }],
        [
          { requesterId: "person", recipientId: "viewer" },
          { requesterId: "person", recipientId: "mutual" },
          { requesterId: "mutual", recipientId: "person" },
        ],
      ),
    ).toBe(1);
  });

  test("returns zero when either side has no overlap", () => {
    expect(
      countMutualConnections(
        "viewer",
        "person",
        [{ requesterId: "viewer", recipientId: "a" }],
        [{ requesterId: "person", recipientId: "b" }],
      ),
    ).toBe(0);
  });
});
