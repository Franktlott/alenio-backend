import { describe, expect, test } from "bun:test";
import { isPlatformAdminEligibleEmail, platformAdminEmails } from "./platform-admin-allowlist";

describe("platform admin allowlist", () => {
  test("reads emails and ignores blanks", () => {
    expect(platformAdminEmails(" Admin@Alenio.com, , not-an-email, admin@alenio.com ")).toEqual([
      "admin@alenio.com",
    ]);
    expect(platformAdminEmails(undefined)).toEqual([]);
  });

  test("only company-domain emails can be promoted", () => {
    expect(isPlatformAdminEligibleEmail("Frank@LottTechnologies.com ")).toBe(true);
    expect(isPlatformAdminEligibleEmail("frank@alenio.app")).toBe(false);
    expect(isPlatformAdminEligibleEmail("frank@lotttechnologies.com.evil.io")).toBe(false);
    expect(isPlatformAdminEligibleEmail("frank@notlotttechnologies.com")).toBe(false);
    expect(isPlatformAdminEligibleEmail(null)).toBe(false);
  });
});
