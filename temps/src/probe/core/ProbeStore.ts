import { ProbeEventEmitter, type ProbeEventListener } from "./events";
import type {
  DiscoveredProbe,
  ProbeConnectionState,
  ProbeError,
  ProbeId,
  ProbeSnapshot,
  TemperatureReading,
} from "./types";

const INITIAL: ProbeSnapshot = {
  connectionState: "idle",
  discovered: [],
  connectedProbeId: null,
  latestReading: null,
  lastError: null,
  reconnectAttempt: 0,
  reconnectSuppressed: false,
  captureRequestSeq: 0,
  disposed: false,
};

/**
 * Immutable snapshot store with subscription fan-out.
 * Pure state — no timers or adapter I/O.
 */
export class ProbeStore {
  private snapshot: ProbeSnapshot = { ...INITIAL, discovered: [] };
  private readonly emitter = new ProbeEventEmitter();

  getSnapshot(): ProbeSnapshot {
    return this.snapshot;
  }

  subscribe(listener: ProbeEventListener): () => void {
    return this.emitter.subscribe(listener);
  }

  setConnectionState(state: ProbeConnectionState): void {
    if (this.snapshot.connectionState === state) return;
    this.patch({ connectionState: state });
    this.emitter.emit({
      type: "connection",
      state,
      probeId: this.snapshot.connectedProbeId,
    });
  }

  setDiscovered(probes: DiscoveredProbe[]): void {
    this.patch({ discovered: probes });
    this.emitter.emit({ type: "discovered", probes });
  }

  setConnectedProbeId(probeId: ProbeId | null): void {
    if (this.snapshot.connectedProbeId === probeId) return;
    this.patch({ connectedProbeId: probeId });
  }

  setLatestReading(reading: TemperatureReading | null): void {
    this.patch({ latestReading: reading });
    if (reading) {
      this.emitter.emit({ type: "reading", reading });
    }
  }

  setLastError(error: ProbeError | null): void {
    this.patch({ lastError: error });
    if (error) {
      this.emitter.emit({ type: "error", error });
    }
  }

  setReconnectAttempt(attempt: number): void {
    if (this.snapshot.reconnectAttempt === attempt) return;
    this.patch({ reconnectAttempt: attempt });
  }

  setReconnectSuppressed(suppressed: boolean): void {
    if (this.snapshot.reconnectSuppressed === suppressed) return;
    this.patch({ reconnectSuppressed: suppressed });
  }

  /** Bump when the connected probe requests a capture (button press). */
  bumpCaptureRequest(): void {
    this.patch({ captureRequestSeq: this.snapshot.captureRequestSeq + 1 });
  }

  markDisposed(): void {
    this.patch({ disposed: true, connectionState: "idle" });
    this.emitter.emit({ type: "disposed" });
  }

  resetForConnect(): void {
    this.patch({
      lastError: null,
      reconnectAttempt: 0,
      reconnectSuppressed: false,
      latestReading: null,
    });
  }

  clearListeners(): void {
    this.emitter.clear();
  }

  private patch(partial: Partial<ProbeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.emitter.emit({ type: "snapshot", snapshot: this.snapshot });
  }
}
