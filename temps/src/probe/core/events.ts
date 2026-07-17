import type {
  DisconnectReason,
  DiscoveredProbe,
  ProbeConnectionState,
  ProbeError,
  ProbeId,
  ProbeSnapshot,
  TemperatureReading,
} from "./types";

export type ProbeEvent =
  | { type: "snapshot"; snapshot: ProbeSnapshot }
  | { type: "discovered"; probes: DiscoveredProbe[] }
  | { type: "connection"; state: ProbeConnectionState; probeId: ProbeId | null }
  | { type: "reading"; reading: TemperatureReading }
  | { type: "disconnected"; probeId: ProbeId; reason: DisconnectReason }
  | { type: "error"; error: ProbeError }
  | { type: "disposed" };

export type ProbeEventListener = (event: ProbeEvent) => void;

/** Minimal typed pub/sub used by ProbeSession / ProbeStore. */
export class ProbeEventEmitter {
  private listeners = new Set<ProbeEventListener>();

  subscribe(listener: ProbeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ProbeEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
