import { describe, expect, test } from "bun:test";
import { buildPeopleInvite } from "./people-invite";
import type { AppVersionInfo } from "./app-version";

const versionInfo: AppVersionInfo = {
  latestVersion: "2.0.0",
  minimumVersion: "1.0.0",
  iosStoreUrl: "https://apps.apple.com/app/alenio/id123",
  androidStoreUrl: "https://play.google.com/store/apps/details?id=com.alenio",
};

describe("buildPeopleInvite", () => {
  test("includes a safe sender identity, username, and both store links", () => {
    const invite = buildPeopleInvite(
      { displayName: "  Alex\nSmith ", username: "@alexsmith" },
      versionInfo,
    );

    expect(invite.subject).toBe("Alex Smith invited you to connect on Alenio");
    expect(invite.body).toContain("search for @alexsmith");
    expect(invite.body).toContain(versionInfo.iosStoreUrl!);
    expect(invite.body).toContain(versionInfo.androidStoreUrl!);
    expect(invite.body).toContain("does not add you to a workspace");
    expect(invite.shareMessage).toBe(invite.body);
  });

  test("falls back to display-name search and generic store copy", () => {
    const invite = buildPeopleInvite(
      { displayName: "Taylor", username: null },
      undefined,
    );

    expect(invite.body).toContain("search for “Taylor”");
    expect(invite.body).toContain("App Store or Google Play");
  });

  test("rejects unsafe store schemes and strips control characters", () => {
    const invite = buildPeopleInvite(
      { displayName: "Sam\r\nBcc: attacker@example.com", username: "sam\tuser" },
      { ...versionInfo, iosStoreUrl: "javascript:alert(1)", androidStoreUrl: "  " },
    );

    expect(invite.subject).toBe(
      "Sam Bcc: attacker@example.com invited you to connect on Alenio",
    );
    expect(invite.body).toContain("@sam user");
    expect(invite.body).not.toContain("javascript:");
  });
});
