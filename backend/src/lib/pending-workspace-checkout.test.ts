import { describe, expect, test } from "bun:test";
import { canFinalizePendingWorkspaceSubscription } from "./pending-workspace-checkout";

describe("pending paid workspace checkout", () => {
  test("creates a workspace only for an active paid subscription", () => {
    expect(canFinalizePendingWorkspaceSubscription("active")).toBe(true);
    expect(canFinalizePendingWorkspaceSubscription("trialing")).toBe(false);
    expect(canFinalizePendingWorkspaceSubscription("incomplete")).toBe(false);
    expect(canFinalizePendingWorkspaceSubscription("past_due")).toBe(false);
    expect(canFinalizePendingWorkspaceSubscription("canceled")).toBe(false);
  });
});
