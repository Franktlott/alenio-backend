import type { ProbeAdapter, ProbeAdapterListener } from "../../core/ProbeAdapter";
import type { DisconnectReason, ProbeId } from "../../core/types";
import {
  connect as nativeConnect,
  disconnect as nativeDisconnect,
  initialize,
  isAvailable,
  startScan as nativeStartScan,
  stopScan as nativeStopScan,
  subscribeToConnectionState,
  subscribeToDevices,
  subscribeToErrors,
} from "./ThermoworksNative";
import {
  mapConnectionReason,
  mapDiscoveredDevices,
  mapNativeError,
} from "./mapNative";

/**
 * ThermoWorks ThermaLib transport implementing the vendor-neutral ProbeAdapter.
 * Phase 3B: discovery + connect/disconnect (no readings yet).
 */
export class ThermoworksProbeAdapter implements ProbeAdapter {
  readonly id = "thermoworks";

  private listeners = new Set<ProbeAdapterListener>();
  private unsubscribers: Array<() => void> = [];
  private disposed = false;
  private wired = false;
  /** Last device we asked native to connect (for disconnect mapping). */
  private activeDeviceId: ProbeId | null = null;

  subscribe(listener: ProbeAdapterListener): () => void {
    this.assertAlive();
    this.ensureWired();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async startScan(): Promise<void> {
    this.assertAlive();
    this.ensureWired();
    await this.ensureInitialized();
    const result = await nativeStartScan();
    if (!result.ok) {
      const error = new Error(result.error ?? "ThermoWorks startScan failed");
      this.emitError(mapNativeError("SCAN_FAILED", error.message));
      throw error;
    }
  }

  async stopScan(): Promise<void> {
    this.assertAlive();
    const result = await nativeStopScan();
    if (!result.ok) {
      const error = new Error(result.error ?? "ThermoWorks stopScan failed");
      this.emitError(mapNativeError("SCAN_FAILED", error.message));
      throw error;
    }
  }

  async connect(probeId: ProbeId): Promise<void> {
    this.assertAlive();
    this.ensureWired();
    await this.ensureInitialized();
    this.activeDeviceId = probeId;
    const result = await nativeConnect(probeId);
    if (!result.ok) {
      this.activeDeviceId = null;
      const error = new Error(result.error ?? "ThermoWorks connect failed");
      this.emitError(mapNativeError("CONNECT_FAILED", error.message, probeId));
      throw error;
    }
    // onConnected is emitted asynchronously when ThermaLib reports ready.
  }

  async disconnect(probeId: ProbeId, reason: DisconnectReason): Promise<void> {
    this.assertAlive();
    if (this.activeDeviceId && this.activeDeviceId !== probeId) {
      // Still attempt native disconnect of current device.
    }
    const result = await nativeDisconnect();
    if (!result.ok) {
      const error = new Error(result.error ?? "ThermoWorks disconnect failed");
      this.emitError(mapNativeError("ADAPTER_ERROR", error.message, probeId));
      throw error;
    }
    // Native emits disconnected; also notify immediately for manual/disposed so
    // ProbeSession reconnect suppression applies without waiting on BLE.
    if (reason === "manual" || reason === "disposed") {
      this.activeDeviceId = null;
      this.emitDisconnected(probeId, reason);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.listeners.clear();
    this.activeDeviceId = null;
    void nativeStopScan().catch(() => undefined);
    void nativeDisconnect().catch(() => undefined);
  }

  private ensureWired(): void {
    if (this.wired || this.disposed) return;
    this.wired = true;

    this.unsubscribers.push(
      subscribeToDevices((devices) => {
        if (this.disposed) return;
        const probes = mapDiscoveredDevices(devices);
        for (const listener of [...this.listeners]) {
          listener.onDiscovered?.(probes);
        }
      }),
    );

    this.unsubscribers.push(
      subscribeToConnectionState((event) => {
        if (this.disposed) return;
        if (event.state === "connected" && event.deviceId) {
          this.activeDeviceId = event.deviceId;
          for (const listener of [...this.listeners]) {
            listener.onConnected?.(event.deviceId);
          }
          return;
        }
        if (event.state === "disconnected" && event.deviceId) {
          const reason = mapConnectionReason(event.reason);
          this.activeDeviceId = null;
          // Avoid double-emit when we already notified on manual disconnect().
          if (reason === "manual") {
            return;
          }
          this.emitDisconnected(event.deviceId, reason);
        }
      }),
    );

    this.unsubscribers.push(
      subscribeToErrors((err) => {
        if (this.disposed) return;
        this.emitError(mapNativeError(err.code, err.message, err.deviceId));
      }),
    );
  }

  private async ensureInitialized(): Promise<void> {
    if (!isAvailable()) {
      throw new Error("AlenioThermoworks native module is not available");
    }
    const result = await initialize();
    if (!result.ok) {
      throw new Error(result.error ?? "ThermaLib initialize failed");
    }
  }

  private emitDisconnected(probeId: ProbeId, reason: DisconnectReason): void {
    for (const listener of [...this.listeners]) {
      listener.onDisconnected?.(probeId, reason);
    }
  }

  private emitError(
    error: Parameters<NonNullable<ProbeAdapterListener["onError"]>>[0],
  ): void {
    for (const listener of [...this.listeners]) {
      listener.onError?.(error);
    }
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("ThermoworksProbeAdapter is disposed");
    }
  }
}
