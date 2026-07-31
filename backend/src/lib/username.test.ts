import { describe, expect, test } from "bun:test";
import {
  USERNAME_MAX_LENGTH,
  allocateUsername,
  buildUsernameCandidate,
  normalizeUsername,
  usernameCooldownRemainingDays,
  validateUsername,
  withUsernameSuffix,
} from "./username";

describe("normalizeUsername", () => {
  test("lowercases and trims so uniqueness is case-insensitive", () => {
    expect(normalizeUsername("  FrankLott ")).toBe("franklott");
    expect(normalizeUsername("FRANK.LOTT")).toBe("frank.lott");
  });
});

describe("validateUsername", () => {
  test("accepts letters, numbers, periods and underscores", () => {
    expect(validateUsername("franklott")).toEqual({ ok: true, username: "franklott" });
    expect(validateUsername("frank.lott")).toEqual({ ok: true, username: "frank.lott" });
    expect(validateUsername("frank_lott9")).toEqual({ ok: true, username: "frank_lott9" });
  });

  test("normalizes before validating", () => {
    expect(validateUsername(" FrankLott ")).toEqual({ ok: true, username: "franklott" });
  });

  test("enforces length bounds", () => {
    expect(validateUsername("ab")).toMatchObject({ ok: false, reason: "too_short" });
    expect(validateUsername("a".repeat(USERNAME_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      reason: "too_long",
    });
  });

  test("rejects spaces and unsupported characters", () => {
    expect(validateUsername("frank lott")).toMatchObject({ ok: false, reason: "invalid_characters" });
    expect(validateUsername("frank-lott")).toMatchObject({ ok: false, reason: "invalid_characters" });
    expect(validateUsername("frank@lott")).toMatchObject({ ok: false, reason: "invalid_characters" });
  });

  test("rejects leading or trailing separators", () => {
    expect(validateUsername(".franklott")).toMatchObject({ ok: false, reason: "invalid_characters" });
    expect(validateUsername("franklott_")).toMatchObject({ ok: false, reason: "invalid_characters" });
  });

  test("rejects consecutive periods", () => {
    expect(validateUsername("frank..lott")).toMatchObject({ ok: false, reason: "consecutive_periods" });
  });

  test("rejects reserved handles regardless of casing", () => {
    expect(validateUsername("admin")).toMatchObject({ ok: false, reason: "reserved" });
    expect(validateUsername("Seneca")).toMatchObject({ ok: false, reason: "reserved" });
  });
});

describe("buildUsernameCandidate", () => {
  test("slugifies a display name", () => {
    expect(buildUsernameCandidate("Frank Lott", "frank@alenio.com")).toBe("franklott");
  });

  test("strips accents and punctuation", () => {
    expect(buildUsernameCandidate("Renée O'Brien", "r@x.com")).toBe("reneeobrien");
  });

  test("falls back to the email local part when the name is unusable", () => {
    expect(buildUsernameCandidate("", "karyna.mulero@alenio.com")).toBe("karyna.mulero");
    expect(buildUsernameCandidate("!!", "antonio@alenio.com")).toBe("antonio");
  });

  test("always yields something usable", () => {
    expect(buildUsernameCandidate(null, null).length).toBeGreaterThanOrEqual(3);
  });

  test("respects the maximum length", () => {
    expect(buildUsernameCandidate("a".repeat(80), null).length).toBe(USERNAME_MAX_LENGTH);
  });
});

describe("withUsernameSuffix", () => {
  test("first attempt keeps the clean handle, later attempts count up", () => {
    expect(withUsernameSuffix("franklott", 1)).toBe("franklott");
    expect(withUsernameSuffix("franklott", 2)).toBe("franklott2");
    expect(withUsernameSuffix("franklott", 3)).toBe("franklott3");
  });

  test("keeps suffixed handles inside the length limit", () => {
    const long = "a".repeat(USERNAME_MAX_LENGTH);
    expect(withUsernameSuffix(long, 12).length).toBe(USERNAME_MAX_LENGTH);
  });
});

describe("usernameCooldownRemainingDays", () => {
  const now = new Date("2026-07-31T00:00:00.000Z");

  test("is zero when the handle has never been changed", () => {
    expect(usernameCooldownRemainingDays(null, now)).toBe(0);
  });

  test("is zero once the window has passed", () => {
    expect(usernameCooldownRemainingDays(new Date("2026-06-01T00:00:00.000Z"), now)).toBe(0);
  });

  test("reports days left inside the window", () => {
    expect(usernameCooldownRemainingDays(new Date("2026-07-21T00:00:00.000Z"), now)).toBe(20);
  });
});

describe("allocateUsername", () => {
  function fakePrisma(taken: string[]) {
    const claimed = new Set(taken);
    const attempted: string[] = [];
    return {
      attempted,
      claimed,
      client: {
        user: {
          update: async ({ data }: { data: { username: string } }) => {
            attempted.push(data.username);
            if (claimed.has(data.username)) {
              throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
            }
            claimed.add(data.username);
            return { id: "user-1" };
          },
        },
      },
    };
  }

  test("claims the clean handle when it is free", async () => {
    const { client } = fakePrisma([]);
    const result = await allocateUsername(client as never, {
      id: "user-1",
      name: "Frank Lott",
      email: "frank@alenio.com",
    });
    expect(result).toBe("franklott");
  });

  test("counts up past collisions", async () => {
    const { client, attempted } = fakePrisma(["franklott", "franklott2"]);
    const result = await allocateUsername(client as never, {
      id: "user-1",
      name: "Frank Lott",
      email: "frank@alenio.com",
    });
    expect(result).toBe("franklott3");
    expect(attempted).toEqual(["franklott", "franklott2", "franklott3"]);
  });

  test("propagates errors that are not uniqueness collisions", async () => {
    const client = {
      user: {
        update: async () => {
          throw new Error("connection lost");
        },
      },
    };
    await expect(
      allocateUsername(client as never, { id: "user-1", name: "Frank Lott", email: null }),
    ).rejects.toThrow("connection lost");
  });
});
