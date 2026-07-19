import type {
  DisconnectReason,
  DiscoveredProbe,
  ProbeError,
  ProbeId,
  TemperatureReading,
} from "./types";

/** Callbacks an adapter may invoke while active. */
export type ProbeAdapterListener = {
  onDiscovered?: (probes: DiscoveredProbe[]) => void;
  onConnected?: (probeId: ProbeId) => void;
  onDisconnected?: (probeId: ProbeId, reason: DisconnectReason) => void;
  onReading?: (reading: TemperatureReading) => void;
  /** Probe hardware asked to confirm/capture the current reading (button). */
  onCaptureRequest?: (probeId: ProbeId) => void;
  onError?: (error: ProbeError) => void;
};

/**
 * Vendor-neutral transport contract.
 * Implementations must not leak vendor-specific types through this surface.
 */
export interface ProbeAdapter {
  readonly id: string;

  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connect(probeId: ProbeId): Promise<void>;
  /**
   * Disconnect the given probe.
   * `reason` is advisory for the adapter; session decides reconnect policy.
   */
  disconnect(probeId: ProbeId, reason: DisconnectReason): Promise<void>;
  subscribe(listener: ProbeAdapterListener): () => void;
  dispose(): void;
}
