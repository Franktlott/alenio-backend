import { describe, expect, it, vi } from "vitest";
import { ProbeStore } from "./ProbeStore";

describe("ProbeStore", () => {
  it("starts with idle snapshot", () => {
    const store = new ProbeStore();
    expect(store.getSnapshot()).toMatchObject({
      connectionState: "idle",
      discovered: [],
      connectedProbeId: null,
      latestReading: null,
      reconnectSuppressed: false,
      disposed: false,
    });
  });

  it("notifies subscribers on patch and supports unsubscribe", () => {
    const store = new ProbeStore();
    const spy = vi.fn();
    const unsub = store.subscribe(spy);
    store.setConnectionState("scanning");
    expect(spy).toHaveBeenCalled();
    const calls = spy.mock.calls.length;
    unsub();
    store.setConnectionState("idle");
    expect(spy.mock.calls.length).toBe(calls);
  });

  it("clearListeners drops all subscribers", () => {
    const store = new ProbeStore();
    const spy = vi.fn();
    store.subscribe(spy);
    store.clearListeners();
    store.setReconnectAttempt(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("resetForConnect clears suppress + error + reading", () => {
    const store = new ProbeStore();
    store.setReconnectSuppressed(true);
    store.setLastError({ code: "CONNECT_FAILED", message: "x" });
    store.setLatestReading({
      probeId: "a",
      celsius: 1,
      status: "ok",
      measuredAt: 1,
    });
    store.setReconnectAttempt(3);
    store.resetForConnect();
    const snap = store.getSnapshot();
    expect(snap.reconnectSuppressed).toBe(false);
    expect(snap.lastError).toBeNull();
    expect(snap.latestReading).toBeNull();
    expect(snap.reconnectAttempt).toBe(0);
  });
});
