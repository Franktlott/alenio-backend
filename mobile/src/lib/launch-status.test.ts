import { describe, expect, test } from "bun:test";
import { LAUNCH_PHASE_LINES, launchStatusLine } from "./launch-status";

describe("launchStatusLine", () => {
  test("rotates within a phase", () => {
    expect(launchStatusLine("workspace", 0)).toBe(
      LAUNCH_PHASE_LINES.workspace[0],
    );
    expect(launchStatusLine("workspace", 1)).toBe(
      LAUNCH_PHASE_LINES.workspace[1],
    );
    expect(launchStatusLine("workspace", 2)).toBe(
      LAUNCH_PHASE_LINES.workspace[0],
    );
  });

  test("finish stays on Opening Home", () => {
    expect(launchStatusLine("finish", 0)).toBe("Opening Home…");
    expect(launchStatusLine("finish", 9)).toBe("Opening Home…");
  });
});
