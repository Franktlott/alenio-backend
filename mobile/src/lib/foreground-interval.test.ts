import { describe, expect, test } from "bun:test";
import { createForegroundIntervalController } from "./foreground-interval";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createForegroundIntervalController", () => {
  test("runs immediately when enabled and stops after being disabled", async () => {
    let calls = 0;
    const controller = createForegroundIntervalController({
      intervalMs: 10,
      task: async () => {
        calls += 1;
      },
    });

    controller.setEnabled(true);
    await flushPromises();
    expect(calls).toBe(1);

    controller.setEnabled(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBe(1);
  });

  test("does not overlap slow tasks", async () => {
    let calls = 0;
    let finishTask: (() => void) | undefined;
    const controller = createForegroundIntervalController({
      intervalMs: 5,
      task: () =>
        new Promise<void>((resolve) => {
          calls += 1;
          finishTask = resolve;
        }),
    });

    controller.setEnabled(true);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(calls).toBe(1);

    finishTask?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toBe(2);
    controller.stop();
  });

  test("swallows failures and continues future intervals", async () => {
    let calls = 0;
    const controller = createForegroundIntervalController({
      intervalMs: 5,
      task: async () => {
        calls += 1;
        if (calls === 1) throw new Error("offline");
      },
    });

    controller.setEnabled(true);
    await new Promise((resolve) => setTimeout(resolve, 12));
    controller.stop();
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
