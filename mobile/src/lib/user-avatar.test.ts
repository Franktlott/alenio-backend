// @ts-expect-error Bun's test types are intentionally outside the Expo app tsconfig.
import { describe, expect, test } from "bun:test";
import { resolveUserImageUrl, userInitials } from "./user-avatar";

describe("user avatar helpers", () => {
  test("uses consistent name and email fallbacks", () => {
    expect(userInitials({ name: "Ada Lovelace", email: "ada@example.com" })).toBe("AL");
    expect(userInitials({ name: "Prince", email: "prince@example.com" })).toBe("PR");
    expect(userInitials({ name: " ", email: "sam@example.com" })).toBe("SA");
    expect(userInitials({})).toBe("?");
  });

  test("normalizes empty and absolute image values", () => {
    expect(resolveUserImageUrl(null)).toBeNull();
    expect(resolveUserImageUrl("   ")).toBeNull();
    expect(resolveUserImageUrl(" https://cdn.example.com/user.jpg ")).toBe(
      "https://cdn.example.com/user.jpg",
    );
  });
});
