import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockProbeAdapter } from "./MockProbeAdapter";
import { STABLE_PROBES, celsiusForSequence } from "./scenarios";

describe("MockProbeAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps stable probe identities across repeated scans", async () => {
    const adapter = new MockProbeAdapter({ scenario: "multiple" });
    const seen: string[][] = [];
    adapter.subscribe({
      onDiscovered: (probes) => seen.push(probes.map((p) => p.id)),
    });

    await adapter.startScan();
    await adapter.startScan();
    await adapter.startScan();

    expect(seen).toHaveLength(3);
    expect(seen[0]).toEqual([
      STABLE_PROBES.a.id,
      STABLE_PROBES.b.id,
      STABLE_PROBES.c.id,
    ]);
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
    adapter.dispose();
  });

  it("emits deterministic continuous Celsius series", async () => {
    const adapter = new MockProbeAdapter({
      scenario: "continuous_celsius",
      readingIntervalMs: 100,
      now: () => 5_000,
    });
    const readings: number[] = [];
    adapter.subscribe({
      onReading: (r) => {
        if (r.celsius != null) readings.push(r.celsius);
      },
    });

    await adapter.connect(STABLE_PROBES.a.id);
    await vi.advanceTimersByTimeAsync(300);

    expect(readings[0]).toBe(celsiusForSequence(20, 0));
    expect(readings[1]).toBe(celsiusForSequence(20, 1));
    expect(readings[2]).toBe(celsiusForSequence(20, 2));
    expect(readings[3]).toBe(celsiusForSequence(20, 3));
    adapter.dispose();
  });

  it("rejects connect in connect_failure scenario", async () => {
    const adapter = new MockProbeAdapter({ scenario: "connect_failure" });
    await expect(adapter.connect(STABLE_PROBES.a.id)).rejects.toThrow(
      /Mock connect failure/,
    );
    adapter.dispose();
  });

  it("can switch scenarios without restart", async () => {
    const adapter = new MockProbeAdapter({ scenario: "zero" });
    const lists: number[] = [];
    adapter.subscribe({
      onDiscovered: (probes) => lists.push(probes.length),
    });
    await adapter.startScan();
    expect(lists.at(-1)).toBe(0);
    adapter.setScenario("multiple");
    expect(lists.at(-1)).toBe(3);
    adapter.dispose();
  });

  it("stops timers on dispose", async () => {
    const adapter = new MockProbeAdapter({
      scenario: "continuous_celsius",
      readingIntervalMs: 50,
    });
    let count = 0;
    adapter.subscribe({ onReading: () => {
      count += 1;
    } });
    await adapter.connect(STABLE_PROBES.a.id);
    const before = count;
    adapter.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(count).toBe(before);
  });
});
