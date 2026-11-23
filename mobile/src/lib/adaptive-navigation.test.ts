import { describe, expect, test } from "bun:test";
import {
  closedCoverClusterEdge,
  navigationSceneInsets,
  resolveNavigationMode,
} from "@/lib/adaptive-navigation";

describe("adaptive navigation", () => {
  test("puts the folded cover's status column on the right", () => {
    expect(closedCoverClusterEdge(480, 700)).toBe("right");
    expect(closedCoverClusterEdge(700, 480)).toBe(null);
    expect(closedCoverClusterEdge(390, 844)).toBe(null);
  });

  test("uses the compact rail for Duo outer and sideways displays", () => {
    expect(resolveNavigationMode(false, "right")).toBe("compactRail");
    expect(resolveNavigationMode(true, "right")).toBe("compactRail");
  });

  test("keeps phones on bottom navigation and tablets on a labeled rail", () => {
    expect(resolveNavigationMode(false, null)).toBe("bottom");
    expect(resolveNavigationMode(true, null)).toBe("labeledRail");
  });

  test("reserves the entire compact rail before laying out a scene", () => {
    expect(
      navigationSceneInsets("compactRail", "right", { left: 0, right: 0 }),
    ).toEqual({ left: 0, right: 84 });
    expect(
      navigationSceneInsets("compactRail", "left", { left: 0, right: 0 }),
    ).toEqual({ left: 84, right: 0 });
  });

  test("includes the safe edge in a labeled rail but not bottom navigation", () => {
    expect(
      navigationSceneInsets("labeledRail", "left", { left: 12, right: 0 }),
    ).toEqual({ left: 86, right: 0 });
    expect(
      navigationSceneInsets("bottom", "right", { left: 0, right: 16 }),
    ).toEqual({ left: 0, right: 0 });
  });
});
