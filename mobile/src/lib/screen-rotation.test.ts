import { describe, expect, test } from "bun:test";
import { screenRotates } from "@/lib/screen-rotation";

describe("screenRotates", () => {
  test("holds phones in portrait, in either orientation", () => {
    // iPhone 15 and the largest Pro Max, reported both ways round.
    expect(screenRotates(393, 852)).toBe(false);
    expect(screenRotates(852, 393)).toBe(false);
    expect(screenRotates(430, 932)).toBe(false);
    expect(screenRotates(932, 430)).toBe(false);
  });

  test("lets tablets and unfolded displays rotate", () => {
    // iPad mini, iPad Pro, and the smallest window the split layouts need.
    expect(screenRotates(744, 1133)).toBe(true);
    expect(screenRotates(1024, 1366)).toBe(true);
    expect(screenRotates(700, 560)).toBe(true);
  });

  test("answers the same however the display is turned", () => {
    for (const [w, h] of [
      [393, 852],
      [744, 1133],
      [700, 560],
    ] as const) {
      expect(screenRotates(w, h)).toBe(screenRotates(h, w));
    }
  });
});
