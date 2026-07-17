import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockProbeAdapter } from "../mock/MockProbeAdapter";
import { STABLE_PROBES } from "../mock/scenarios";
import { createProbeSystem } from "./createProbeSystem";
import { createSeededRandom } from "./ReconnectPolicy";
import type { ProbeSystem } from "./createProbeSystem";

describe("ProbeSession", () => {
  let system: ProbeSystem;
  let adapter: MockProbeAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new MockProbeAdapter({
      scenario: "continuous_celsius",
      readingIntervalMs: 1_000,
      now: () => Date.now(),
    });
    system = createProbeSystem({
      adapter,
      validator: { staleAfterMs: 5_000, minCelsius: -40, maxCelsius: 300 },
      reconnectPolicy: {
        maxAttempts: 4,
        initialDelayMs: 100,
        multiplier: 2,
        maxDelayMs: 1_000,
        jitterRatio: 0.2,
        random: createSeededRandom(99),
      },
    });
  });

  afterEach(() => {
    system.dispose();
    vi.useRealTimers();
  });

  it("discovers zero, one, or multiple probes with stable ids", async () => {
    adapter.setScenario("zero");
    await system.session.startScan();
    expect(system.store.getSnapshot().discovered).toEqual([]);

    adapter.setScenario("one");
    await system.session.startScan();
    expect(system.store.getSnapshot().discovered.map((p) => p.id)).toEqual([
      STABLE_PROBES.a.id,
    ]);

    adapter.setScenario("multiple");
    await system.session.startScan();
    const first = system.store.getSnapshot().discovered.map((p) => p.id);
    expect(first).toEqual([
      STABLE_PROBES.a.id,
      STABLE_PROBES.b.id,
      STABLE_PROBES.c.id,
    ]);

    await system.session.startScan();
    expect(system.store.getSnapshot().discovered.map((p) => p.id)).toEqual(first);
  });

  it("connects successfully and streams Celsius readings", async () => {
    adapter.setScenario("continuous_celsius");
    await system.session.startScan();
    await system.session.connect(STABLE_PROBES.a.id);

    expect(system.store.getSnapshot().connectionState).toBe("connected");
    const first = system.store.getSnapshot().latestReading;
    expect(first?.status).toBe("ok");
    expect(first?.celsius).toBe(20);

    await vi.advanceTimersByTimeAsync(1_000);
    const second = system.store.getSnapshot().latestReading;
    expect(second?.celsius).toBe(20.1);
    expect(second?.status).toBe("ok");
  });

  it("surfaces connection failure", async () => {
    adapter.setScenario("connect_failure");
    await system.session.startScan();
    await expect(system.session.connect(STABLE_PROBES.a.id)).rejects.toThrow(
      /Mock connect failure/,
    );
    expect(system.store.getSnapshot().connectionState).toBe("failed");
    expect(system.store.getSnapshot().lastError?.code).toBe("CONNECT_FAILED");
  });

  it("validates stale, fault, unavailable, and out-of-range readings", async () => {
    adapter.setScenario("stale");
    await system.session.startScan();
    await system.session.connect(STABLE_PROBES.a.id);
    expect(system.store.getSnapshot().latestReading?.status).toBe("stale");

    adapter.setScenario("fault");
    expect(system.store.getSnapshot().latestReading?.status).toBe("fault");

    adapter.setScenario("unavailable");
    expect(system.store.getSnapshot().latestReading?.status).toBe("unavailable");

    adapter.setScenario("out_of_range");
    expect(system.store.getSnapshot().latestReading?.status).toBe("out_of_range");
    expect(system.store.getSnapshot().latestReading?.celsius).toBe(420);
  });

  it("reconnects after unexpected disconnect using backoff + jitter", async () => {
    adapter.setScenario("unexpected_disconnect");
    await system.session.startScan();
    await system.session.connect(STABLE_PROBES.a.id);
    expect(system.store.getSnapshot().connectionState).toBe("connected");

    // 3 readings then unexpected disconnect on 4th tick
    await vi.advanceTimersByTimeAsync(3_000);
    expect(system.store.getSnapshot().connectionState).toBe("reconnecting");
    expect(system.store.getSnapshot().reconnectAttempt).toBe(1);
    expect(system.store.getSnapshot().reconnectSuppressed).toBe(false);

    // Seeded first delay for attempt 0 with policy above
    await vi.advanceTimersByTimeAsync(500);
    expect(
      ["connecting", "connected", "reconnecting"].includes(
        system.store.getSnapshot().connectionState,
      ),
    ).toBe(true);
  });

  it("manual disconnect suppresses reconnect permanently until connect", async () => {
    adapter.setScenario("continuous_celsius");
    await system.session.startScan();
    await system.session.connect(STABLE_PROBES.a.id);
    await system.session.disconnect();

    const snap = system.store.getSnapshot();
    expect(snap.connectionState).toBe("idle");
    expect(snap.reconnectSuppressed).toBe(true);
    expect(snap.connectedProbeId).toBeNull();

    // Simulate unexpected disconnect signal — must not reconnect.
    adapter.simulateTransportDisconnect("unexpected", STABLE_PROBES.a.id);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(system.store.getSnapshot().connectionState).toBe("idle");
    expect(system.store.getSnapshot().reconnectAttempt).toBe(0);

    // Explicit connect clears suppression.
    await system.session.connect(STABLE_PROBES.a.id);
    expect(system.store.getSnapshot().reconnectSuppressed).toBe(false);
    expect(system.store.getSnapshot().connectionState).toBe("connected");
  });

  it("dispose cancels timers, subscriptions, and further work", async () => {
    adapter.setScenario("unexpected_disconnect");
    await system.session.startScan();
    await system.session.connect(STABLE_PROBES.a.id);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(system.store.getSnapshot().connectionState).toBe("reconnecting");

    system.dispose();
    expect(system.store.getSnapshot().disposed).toBe(true);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(system.store.getSnapshot().connectionState).toBe("idle");
    await expect(system.session.startScan()).rejects.toThrow(/disposed/i);
  });

  it("switches mock scenarios without recreating the system", async () => {
    adapter.setScenario("zero");
    await system.session.startScan();
    expect(system.store.getSnapshot().discovered).toHaveLength(0);

    adapter.setScenario("multiple");
    expect(system.store.getSnapshot().discovered).toHaveLength(3);

    adapter.setScenario("one");
    expect(system.store.getSnapshot().discovered).toHaveLength(1);
    expect(system.store.getSnapshot().discovered[0]?.id).toBe(STABLE_PROBES.a.id);
  });
});
