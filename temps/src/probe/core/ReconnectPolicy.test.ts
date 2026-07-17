import { describe, expect, it } from "vitest";
import { createSeededRandom, ReconnectPolicy } from "./ReconnectPolicy";

describe("ReconnectPolicy", () => {
  it("returns null when attempts exhausted", () => {
    const policy = new ReconnectPolicy({
      maxAttempts: 3,
      jitterRatio: 0,
      random: () => 0.5,
    });
    expect(policy.nextDelayMs(0)).not.toBeNull();
    expect(policy.nextDelayMs(2)).not.toBeNull();
    expect(policy.nextDelayMs(3)).toBeNull();
  });

  it("applies exponential backoff without jitter when jitterRatio is 0", () => {
    const policy = new ReconnectPolicy({
      maxAttempts: 5,
      initialDelayMs: 100,
      multiplier: 2,
      maxDelayMs: 10_000,
      jitterRatio: 0,
    });
    expect(policy.nextDelayMs(0)).toBe(100);
    expect(policy.nextDelayMs(1)).toBe(200);
    expect(policy.nextDelayMs(2)).toBe(400);
  });

  it("caps delay at maxDelayMs", () => {
    const policy = new ReconnectPolicy({
      maxAttempts: 10,
      initialDelayMs: 1_000,
      multiplier: 10,
      maxDelayMs: 2_500,
      jitterRatio: 0,
    });
    expect(policy.nextDelayMs(2)).toBe(2_500);
  });

  it("produces stable jitter with seeded random", () => {
    const a = new ReconnectPolicy({
      maxAttempts: 5,
      initialDelayMs: 1_000,
      multiplier: 2,
      jitterRatio: 0.2,
      random: createSeededRandom(42),
    });
    const b = new ReconnectPolicy({
      maxAttempts: 5,
      initialDelayMs: 1_000,
      multiplier: 2,
      jitterRatio: 0.2,
      random: createSeededRandom(42),
    });
    const delaysA = [0, 1, 2, 3].map((i) => a.nextDelayMs(i));
    const delaysB = [0, 1, 2, 3].map((i) => b.nextDelayMs(i));
    expect(delaysA).toEqual(delaysB);
    expect(delaysA.every((d) => d != null && d >= 0)).toBe(true);
  });

  it("createSeededRandom is deterministic", () => {
    const r1 = createSeededRandom(7);
    const r2 = createSeededRandom(7);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});
