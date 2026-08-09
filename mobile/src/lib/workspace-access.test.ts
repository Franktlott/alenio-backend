import { describe, expect, test } from "bun:test";
import {
  deriveWorkspaceAccess,
  trialBannerPresentation,
  type WorkspaceSubscription,
} from "./workspace-access-core";

function subscription(overrides: Partial<WorkspaceSubscription> = {}): WorkspaceSubscription {
  return {
    plan: "operations",
    status: "trialing",
    trialStartedAt: "2026-08-01T12:00:00.000Z",
    trialEndsAt: "2026-08-15T12:00:00.000Z",
    remainingDays: 9,
    canWrite: true,
    accessMode: "full",
    bannerSeverity: "info",
    hasTeamFeatures: true,
    hasGoFeatures: true,
    ...overrides,
  };
}

describe("workspace access", () => {
  test("keeps legacy free workspaces writable without marketing them as a trial", () => {
    const access = deriveWorkspaceAccess(
      subscription({
        plan: "free",
        status: "active",
        trialStartedAt: null,
        trialEndsAt: null,
        remainingDays: null,
        hasTeamFeatures: false,
        hasGoFeatures: false,
      }),
    );
    expect(access.isLegacyFree).toBe(true);
    expect(access.canWrite).toBe(true);
    expect(trialBannerPresentation(access).visible).toBe(false);
  });

  test.each([
    [8, "info"],
    [7, "info"],
    [3, "warning"],
    [1, "warning"],
  ] as const)(
    "uses the expected banner threshold for %s days",
    (remainingDays: number, severity: "info" | "warning") => {
    const presentation = trialBannerPresentation(
      deriveWorkspaceAccess(subscription({ remainingDays })),
    );
    expect(presentation.visible).toBe(true);
    expect(presentation.severity).toBe(severity);
    expect(presentation.title.length).toBeGreaterThan(0);
    },
  );

  test("expired workspaces remain navigable but are clearly read-only", () => {
    const access = deriveWorkspaceAccess(
      subscription({
        status: "expired",
        remainingDays: 0,
        canWrite: false,
        accessMode: "read_only",
        bannerSeverity: "critical",
      }),
    );
    const presentation = trialBannerPresentation(access);
    expect(access.canWrite).toBe(false);
    expect(presentation.severity).toBe("critical");
    expect(presentation.title).toContain("read-only");
  });
});
