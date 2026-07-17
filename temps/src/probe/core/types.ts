/** Stable identity for a physical or mock probe. */
export type ProbeId = string;

export type ProbeConnectionState =
  | "idle"
  | "scanning"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "reconnecting"
  | "failed";

/**
 * Quality / availability of a temperature sample.
 * Canonical numeric values are always Celsius when present.
 */
export type ReadingStatus = "ok" | "stale" | "fault" | "unavailable" | "out_of_range";

export type TemperatureReading = {
  probeId: ProbeId;
  /** Canonical temperature in Celsius. Null when unavailable or faulted. */
  celsius: number | null;
  status: ReadingStatus;
  /** Epoch milliseconds when the sample was measured. */
  measuredAt: number;
  sequence?: number;
};

export type DiscoveredProbe = {
  id: ProbeId;
  name: string;
  rssi?: number;
};

export type DisconnectReason = "manual" | "unexpected" | "failed" | "disposed";

export type ProbeErrorCode =
  | "SCAN_FAILED"
  | "CONNECT_FAILED"
  | "ADAPTER_ERROR"
  | "DISPOSED"
  | "RECONNECT_EXHAUSTED";

export type ProbeError = {
  code: ProbeErrorCode;
  message: string;
  probeId?: ProbeId;
  cause?: unknown;
};

export type ProbeSnapshot = {
  connectionState: ProbeConnectionState;
  discovered: DiscoveredProbe[];
  connectedProbeId: ProbeId | null;
  latestReading: TemperatureReading | null;
  lastError: ProbeError | null;
  reconnectAttempt: number;
  /** True after an explicit manual disconnect until the next connect(). */
  reconnectSuppressed: boolean;
  disposed: boolean;
};
