import type { ProbeAdapter, ProbeAdapterListener } from "../core/ProbeAdapter";
import type {
  DisconnectReason,
  ProbeId,
  TemperatureReading,
} from "../core/types";
import {
  celsiusForSequence,
  getScenario,
  type MockScenarioName,
} from "./scenarios";

export type MockProbeAdapterOptions = {
  scenario?: MockScenarioName;
  /** Reading interval while connected. Default 500ms. */
  readingIntervalMs?: number;
  /** Clock injection for deterministic measuredAt. */
  now?: () => number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

/**
 * In-process probe transport for development and unit tests.
 * Scenarios are deterministic; probe IDs are stable across scans.
 */
export class MockProbeAdapter implements ProbeAdapter {
  readonly id = "mock";

  private scenarioName: MockScenarioName;
  private readonly readingIntervalMs: number;
  private readonly now: () => number;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;

  private listeners = new Set<ProbeAdapterListener>();
  private scanning = false;
  private connectedId: ProbeId | null = null;
  private readingTimer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private ticksSinceConnect = 0;
  private disposed = false;

  constructor(options: MockProbeAdapterOptions = {}) {
    this.scenarioName = options.scenario ?? "continuous_celsius";
    this.readingIntervalMs = options.readingIntervalMs ?? 500;
    this.now = options.now ?? (() => Date.now());
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  }

  getScenarioName(): MockScenarioName {
    return this.scenarioName;
  }

  /**
   * Switch scenario without recreating the adapter / restarting the app.
   * Restarts reading loop if currently connected.
   */
  setScenario(name: MockScenarioName): void {
    this.assertAlive();
    this.scenarioName = name;
    this.sequence = 0;
    this.ticksSinceConnect = 0;

    if (this.scanning) {
      this.emitDiscovered();
    }

    if (this.connectedId) {
      const scenario = getScenario(name);
      if (scenario.connectFails) {
        void this.forceUnexpectedDisconnect();
        return;
      }
      this.restartReadingLoop();
    }
  }

  subscribe(listener: ProbeAdapterListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async startScan(): Promise<void> {
    this.assertAlive();
    this.scanning = true;
    this.emitDiscovered();
  }

  async stopScan(): Promise<void> {
    this.scanning = false;
  }

  async connect(probeId: ProbeId): Promise<void> {
    this.assertAlive();
    const scenario = getScenario(this.scenarioName);

    if (!scenario.probes.some((p) => p.id === probeId)) {
      throw new Error(`Unknown probe: ${probeId}`);
    }

    if (scenario.connectFails) {
      const error = new Error("Mock connect failure");
      this.emitError({
        code: "CONNECT_FAILED",
        message: error.message,
        probeId,
        cause: error,
      });
      throw error;
    }

    if (this.connectedId && this.connectedId !== probeId) {
      await this.disconnect(this.connectedId, "manual");
    }

    this.connectedId = probeId;
    this.sequence = 0;
    this.ticksSinceConnect = 0;
    this.emitConnected(probeId);
    this.restartReadingLoop();
  }

  async disconnect(probeId: ProbeId, reason: DisconnectReason): Promise<void> {
    if (this.connectedId !== probeId) return;
    this.stopReadingLoop();
    this.connectedId = null;
    this.emitDisconnected(probeId, reason);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scanning = false;
    this.stopReadingLoop();
    const id = this.connectedId;
    this.connectedId = null;
    if (id) {
      this.emitDisconnected(id, "disposed");
    }
    this.listeners.clear();
  }

  /** Test helper: emit one reading tick immediately. */
  tick(): void {
    this.emitReadingTick();
  }

  /**
   * Test helper: simulate a transport-level drop.
   * When already disconnected, pass `probeId` to still notify listeners.
   */
  simulateTransportDisconnect(
    reason: DisconnectReason = "unexpected",
    probeId?: ProbeId,
  ): void {
    const id = this.connectedId ?? probeId;
    this.stopReadingLoop();
    this.connectedId = null;
    if (id) {
      this.emitDisconnected(id, reason);
    }
  }

  private emitDiscovered(): void {
    const probes = getScenario(this.scenarioName).probes.map((p) => ({ ...p }));
    for (const listener of [...this.listeners]) {
      listener.onDiscovered?.(probes);
    }
  }

  private emitConnected(probeId: ProbeId): void {
    for (const listener of [...this.listeners]) {
      listener.onConnected?.(probeId);
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

  private restartReadingLoop(): void {
    this.stopReadingLoop();
    const scenario = getScenario(this.scenarioName);
    if (!this.connectedId) return;

    // Immediate first sample for snappy UI / tests.
    this.emitReadingTick();

    if (!scenario.continuous) return;

    this.readingTimer = this.setIntervalFn(() => {
      this.emitReadingTick();
    }, this.readingIntervalMs) as ReturnType<typeof setInterval>;
  }

  private stopReadingLoop(): void {
    if (this.readingTimer != null) {
      this.clearIntervalFn(this.readingTimer);
      this.readingTimer = null;
    }
  }

  private emitReadingTick(): void {
    if (!this.connectedId || this.disposed) return;

    const scenario = getScenario(this.scenarioName);
    this.ticksSinceConnect += 1;

    if (
      scenario.disconnectAfterTicks != null &&
      this.ticksSinceConnect > scenario.disconnectAfterTicks
    ) {
      void this.forceUnexpectedDisconnect();
      return;
    }

    const reading = this.buildReading(this.connectedId);
    for (const listener of [...this.listeners]) {
      listener.onReading?.(reading);
    }
    this.sequence += 1;
  }

  private buildReading(probeId: ProbeId): TemperatureReading {
    const scenario = getScenario(this.scenarioName);
    const template = scenario.reading;
    const now = this.now();
    const measuredAt =
      template.ageMs != null ? now - template.ageMs : now;

    let celsius = template.celsius;
    if (
      celsius != null &&
      template.status === "ok" &&
      scenario.continuous &&
      template.ageMs == null
    ) {
      celsius = celsiusForSequence(celsius, this.sequence);
    }

    return {
      probeId,
      celsius,
      status: template.status,
      measuredAt,
      sequence: this.sequence,
    };
  }

  private async forceUnexpectedDisconnect(): Promise<void> {
    const id = this.connectedId;
    if (!id) return;
    this.stopReadingLoop();
    this.connectedId = null;
    this.emitDisconnected(id, "unexpected");
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("MockProbeAdapter has been disposed");
    }
  }
}
