import { describe, expect, test } from "bun:test";
import {
  remainingTrialDays,
  resolveWorkspaceAccess,
  trialEndsAtFrom,
} from "./workspace-access";

const now = new Date("2026-08-06T12:00:00.000Z");

function subscription(status: string, plan = "operations", trialEndsAt: Date | null = null) {
  return {
    teamId: "team-1",
    plan,
    status,
    trialStartedAt: trialEndsAt ? new Date("2026-08-01T12:00:00.000Z") : null,
    trialEndsAt,
  };
}

describe("workspace access resolution", () => {
  test("operations trial is writable and includes all features", () => {
    const state = resolveWorkspaceAccess(
      "team-1",
      subscription("trialing", "operations", new Date("2026-08-12T12:00:00.000Z")),
      now,
    );
    expect(state.status).toBe("trialing");
    expect(state.remainingDays).toBe(6);
    expect(state.canWrite).toBe(true);
    expect(state.accessMode).toBe("full");
    expect(state.hasTeamFeatures).toBe(true);
    expect(state.hasGoFeatures).toBe(true);
  });

  test("an ended trial resolves expired and read-only", () => {
    const state = resolveWorkspaceAccess(
      "team-1",
      subscription("trialing", "operations", new Date("2026-08-06T11:59:59.999Z")),
      now,
    );
    expect(state.status).toBe("expired");
    expect(state.remainingDays).toBe(0);
    expect(state.canWrite).toBe(false);
    expect(state.bannerSeverity).toBe("critical");
  });

  test.each(["past_due", "canceled", "expired"])("%s is read-only", (status) => {
    const state = resolveWorkspaceAccess("team-1", subscription(status), now);
    expect(state.canWrite).toBe(false);
    expect(state.accessMode).toBe("read_only");
  });

  test("active paid and grandfathered legacy workspaces remain writable", () => {
    expect(resolveWorkspaceAccess("paid", subscription("active", "team"), now).canWrite).toBe(true);
    expect(resolveWorkspaceAccess("missing", null, now).isLegacyGrandfathered).toBe(true);
    expect(resolveWorkspaceAccess("missing", null, now).canWrite).toBe(true);
    expect(resolveWorkspaceAccess("free", subscription("active", "free"), now).canWrite).toBe(true);
  });
});

describe("trial date calculation", () => {
  test("adds exactly fourteen days", () => {
    expect(trialEndsAtFrom(now).toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });

  test("remaining days rounds partial days up and never goes negative", () => {
    expect(remainingTrialDays(new Date(now.getTime() + 1), now)).toBe(1);
    expect(remainingTrialDays(new Date(now.getTime() - 1), now)).toBe(0);
    expect(remainingTrialDays(null, now)).toBeNull();
  });
});
