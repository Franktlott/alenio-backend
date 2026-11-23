import { describe, expect, test } from "bun:test";
import { inkForBackground, relativeLuminance } from "./cover-contrast";

describe("cover contrast", () => {
  test("measures luminance for pure black and white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 3);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 3);
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 3);
  });

  test("picks dark ink on light covers and light ink on dark covers", () => {
    expect(inkForBackground("#F8FAFC")).toEqual("dark");
    expect(inkForBackground("#E2E8F0")).toEqual("dark");
    expect(inkForBackground("#1A0B3A")).toEqual("light");
    expect(inkForBackground("#0F172A")).toEqual("light");
  });
});
