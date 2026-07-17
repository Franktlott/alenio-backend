import type { ProbeAdapter } from "./ProbeAdapter";
import type { ReconnectPolicy } from "./ReconnectPolicy";
import type { ReadingValidator } from "./ReadingValidator";
import { ProbeStore } from "./ProbeStore";
import type {
  DisconnectReason,
  ProbeId,
  TemperatureReading,
} from "./types";

export type ProbeSessionOptions = {
  adapter: ProbeAdapter;
  store?: ProbeStore;
  validator: ReadingValidator;
  reconnectPolicy: ReconnectPolicy;
  /** Timer injection for tests. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

/**
 * Orchestrates adapter I/O, validated readings, and reconnect policy.
 * All timers / subscriptions are torn down by dispose().
 */
export class ProbeSession {
  private readonly adapter: ProbeAdapter;
  private readonly store: ProbeStore;
  private readonly validator: ReadingValidator;
  private readonly reconnectPolicy: ReconnectPolicy;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;

  private unsubscribeAdapter: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** Probe we intend to keep connected (for reconnect). */
  private targetProbeId: ProbeId | null = null;
  private connectGeneration = 0;

  constructor(options: ProbeSessionOptions) {
    this.adapter = options.adapter;
    this.store = options.store ?? new ProbeStore();
    this.validator = options.validator;
    this.reconnectPolicy = options.reconnectPolicy;
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

    this.unsubscribeAdapter = this.adapter.subscribe({
      onDiscovered: (probes) => {
        if (this.disposed) return;
        this.store.setDiscovered(probes);
      },
      onConnected: (probeId) => {
        if (this.disposed) return;
        this.clearReconnectTimer();
        this.targetProbeId = probeId;
        this.store.setConnectedProbeId(probeId);
        this.store.setReconnectAttempt(0);
        this.store.setConnectionState("connected");
      },
      onDisconnected: (probeId, reason) => {
        if (this.disposed) return;
        void this.handleDisconnected(probeId, reason);
      },
      onReading: (reading) => {
        if (this.disposed) return;
        this.applyReading(reading);
      },
      onError: (error) => {
        if (this.disposed) return;
        this.store.setLastError(error);
      },
    });
  }

  getStore(): ProbeStore {
    return this.store;
  }

  async startScan(): Promise<void> {
    this.assertAlive();
    this.store.setLastError(null);
    this.store.setConnectionState("scanning");
    try {
      await this.adapter.startScan();
    } catch (cause) {
      this.store.setConnectionState("failed");
      this.store.setLastError({
        code: "SCAN_FAILED",
        message: cause instanceof Error ? cause.message : "Scan failed",
        cause,
      });
      throw cause;
    }
  }

  async stopScan(): Promise<void> {
    this.assertAlive();
    await this.adapter.stopScan();
    const snap = this.store.getSnapshot();
    if (snap.connectionState === "scanning" && !snap.connectedProbeId) {
      this.store.setConnectionState("idle");
    }
  }

  async connect(probeId: ProbeId): Promise<void> {
    this.assertAlive();
    this.clearReconnectTimer();
    this.store.resetForConnect();
    this.targetProbeId = probeId;
    this.store.setConnectedProbeId(probeId);
    this.store.setConnectionState("connecting");
    const generation = ++this.connectGeneration;

    try {
      await this.adapter.connect(probeId);
      if (this.disposed || generation !== this.connectGeneration) return;
      // Adapter may already have emitted onConnected; ensure state.
      if (this.store.getSnapshot().connectionState !== "connected") {
        this.store.setConnectionState("connected");
      }
    } catch (cause) {
      if (this.disposed || generation !== this.connectGeneration) return;
      this.store.setConnectionState("failed");
      this.store.setLastError({
        code: "CONNECT_FAILED",
        message: cause instanceof Error ? cause.message : "Connect failed",
        probeId,
        cause,
      });
      this.targetProbeId = null;
      this.store.setConnectedProbeId(null);
      throw cause;
    }
  }

  /**
   * Explicit user disconnect. Permanently suppresses reconnect until
   * a new explicit connect() call.
   */
  async disconnect(): Promise<void> {
    this.assertAlive();
    this.clearReconnectTimer();
    this.store.setReconnectSuppressed(true);
    this.connectGeneration += 1;

    const probeId = this.targetProbeId ?? this.store.getSnapshot().connectedProbeId;
    this.targetProbeId = null;
    this.store.setConnectionState("disconnecting");

    if (probeId) {
      await this.adapter.disconnect(probeId, "manual");
    }

    this.store.setConnectedProbeId(null);
    this.store.setLatestReading(null);
    this.store.setReconnectAttempt(0);
    this.store.setConnectionState("idle");
  }

  /**
   * Cancel timers, stop scans, disconnect adapter, and drop listeners.
   * Safe to call multiple times.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearReconnectTimer();
    this.connectGeneration += 1;
    this.targetProbeId = null;

    this.unsubscribeAdapter?.();
    this.unsubscribeAdapter = null;

    void this.adapter.stopScan().catch(() => undefined);
    const probeId = this.store.getSnapshot().connectedProbeId;
    if (probeId) {
      void this.adapter.disconnect(probeId, "disposed").catch(() => undefined);
    }

    this.adapter.dispose();
    this.store.markDisposed();
    this.store.clearListeners();
  }

  private applyReading(reading: TemperatureReading): void {
    const validated = this.validator.validate(reading);
    this.store.setLatestReading(validated);
  }

  private async handleDisconnected(
    probeId: ProbeId,
    reason: DisconnectReason,
  ): Promise<void> {
    this.store.setLatestReading(null);

    if (reason === "manual" || reason === "disposed") {
      this.targetProbeId = null;
      this.store.setConnectedProbeId(null);
      this.store.setConnectionState("idle");
      return;
    }

    // Unexpected / failed disconnect from the transport.
    this.store.setConnectedProbeId(null);

    if (this.store.getSnapshot().reconnectSuppressed) {
      this.targetProbeId = null;
      this.store.setConnectionState("idle");
      return;
    }

    if (!this.targetProbeId || this.targetProbeId !== probeId) {
      this.store.setConnectionState("idle");
      return;
    }

    await this.scheduleReconnect(probeId);
  }

  private async scheduleReconnect(probeId: ProbeId): Promise<void> {
    const attempt = this.store.getSnapshot().reconnectAttempt;
    const delay = this.reconnectPolicy.nextDelayMs(attempt);

    if (delay == null) {
      this.store.setConnectionState("failed");
      this.store.setLastError({
        code: "RECONNECT_EXHAUSTED",
        message: "Automatic reconnect attempts exhausted",
        probeId,
      });
      this.targetProbeId = null;
      return;
    }

    this.store.setConnectionState("reconnecting");
    this.store.setReconnectAttempt(attempt + 1);

    const generation = this.connectGeneration;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      if (this.disposed || generation !== this.connectGeneration) return;
      if (this.store.getSnapshot().reconnectSuppressed) return;
      void this.attemptReconnect(probeId, generation);
    }, delay) as ReturnType<typeof setTimeout>;
  }

  private async attemptReconnect(
    probeId: ProbeId,
    generation: number,
  ): Promise<void> {
    if (this.disposed || generation !== this.connectGeneration) return;
    if (this.store.getSnapshot().reconnectSuppressed) return;

    this.store.setConnectionState("connecting");
    this.store.setConnectedProbeId(probeId);

    try {
      await this.adapter.connect(probeId);
      if (this.disposed || generation !== this.connectGeneration) return;
      if (this.store.getSnapshot().connectionState !== "connected") {
        this.store.setConnectionState("connected");
      }
      this.store.setReconnectAttempt(0);
    } catch (cause) {
      if (this.disposed || generation !== this.connectGeneration) return;
      this.store.setLastError({
        code: "CONNECT_FAILED",
        message: cause instanceof Error ? cause.message : "Reconnect failed",
        probeId,
        cause,
      });
      await this.scheduleReconnect(probeId);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer != null) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private assertAlive(): void {
    if (this.disposed || this.store.getSnapshot().disposed) {
      const error = {
        code: "DISPOSED" as const,
        message: "ProbeSession has been disposed",
      };
      this.store.setLastError(error);
      throw Object.assign(new Error(error.message), error);
    }
  }
}
