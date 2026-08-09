import { describe, expect, test } from "bun:test";
import {
  orderWorkspacesCurrentFirst,
  workspaceMemberCountLabel,
  workspacePreviewCardWidth,
  workspaceStatusDisplay,
  workspaceStatusLine,
} from "./profile-workspace-carousel";

describe("profile workspace carousel", () => {
  test("moves the active workspace first without changing remaining order", () => {
    const workspaces = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(orderWorkspacesCurrentFirst(workspaces, "b").map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(workspaces.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  test("keeps the original order when the active workspace is absent", () => {
    expect(
      orderWorkspacesCurrentFirst([{ id: "a" }, { id: "b" }], "missing").map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b"]);
  });

  test("calculates responsive card widths with lower and upper bounds", () => {
    expect(workspacePreviewCardWidth(320)).toBe(100);
    expect(workspacePreviewCardWidth(366)).toBe(115);
    expect(workspacePreviewCardWidth(430)).toBe(136);
    expect(workspacePreviewCardWidth(1024)).toBe(150);
  });

  test("formats member counts", () => {
    expect(workspaceMemberCountLabel(1)).toBe("1 member");
    expect(workspaceMemberCountLabel(12)).toBe("12 members");
    expect(workspaceMemberCountLabel(undefined)).toBe("0 members");
  });

  test("formats trial status as one concise line", () => {
    expect(
      workspaceStatusDisplay({
        status: "trialing",
        plan: "operations",
        trialEndsAt: "2026-08-20T12:00:00.000Z",
      }),
    ).toEqual({
      kind: "trial",
      title: "Trial",
      detail: "Ends Aug 20",
      line: "Trial · Ends Aug 20",
    });
    expect(
      workspaceStatusLine({
        status: "trialing",
        plan: "operations",
        trialEndsAt: "2026-08-20T12:00:00.000Z",
      }),
    ).toBe("Trial · Ends Aug 20");
  });

  test("shows paid plan then falls back to Active", () => {
    expect(workspaceStatusLine({ status: "active", plan: "operations" })).toBe("Operations");
    expect(workspaceStatusLine({ status: "active", plan: "pro" })).toBe("Pro");
    expect(workspaceStatusLine({ status: "active", plan: "team" })).toBe("Pro");
    expect(workspaceStatusLine({ status: "active", plan: "free" })).toBe("Active");
    expect(workspaceStatusLine(undefined)).toBe("Active");
  });

  test("does not claim a trial date when the date is invalid", () => {
    expect(
      workspaceStatusLine({
        status: "trialing",
        plan: "pro",
        trialEndsAt: "not-a-date",
      }),
    ).toBe("Pro");
  });
});
