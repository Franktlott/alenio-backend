import { describe, expect, test } from "bun:test";
import { buildDmPairKey } from "./dm-pair-key";
import { buildGroupWorkspaceContext, formatWorkspaceListLabel } from "./group-conversation-workspace";

describe("buildDmPairKey", () => {
  test("is order-independent", () => {
    expect(buildDmPairKey("user-b", "user-a")).toBe("user-a:user-b");
    expect(buildDmPairKey("user-a", "user-b")).toBe("user-a:user-b");
  });

  test("uses colon separator", () => {
    expect(buildDmPairKey("a", "b")).toBe("a:b");
  });
});

describe("group workspace labels", () => {
  test("formats single and multi workspace labels", () => {
    expect(formatWorkspaceListLabel([])).toBe("");
    expect(formatWorkspaceListLabel([{ name: "Store A" }])).toBe("Store A");
    expect(formatWorkspaceListLabel([{ name: "A" }, { name: "B" }])).toBe("A · B");
    expect(formatWorkspaceListLabel([{ name: "A" }, { name: "B" }, { name: "C" }])).toBe("A · +2");
  });

  test("buildGroupWorkspaceContext marks cross-workspace", () => {
    expect(buildGroupWorkspaceContext([])).toEqual({
      label: "",
      workspaces: [],
      isCrossWorkspace: false,
    });
    expect(
      buildGroupWorkspaceContext([
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]),
    ).toEqual({
      label: "Cross-workspace",
      workspaces: [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ],
      isCrossWorkspace: true,
    });
  });
});
