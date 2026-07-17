import type { DiscoveredProbe, ReadingStatus } from "../core/types";

/** Named mock behaviors selectable without restarting the app. */
export type MockScenarioName =
  | "zero"
  | "one"
  | "multiple"
  | "connect_failure"
  | "continuous_celsius"
  | "stale"
  | "fault"
  | "unavailable"
  | "out_of_range"
  | "unexpected_disconnect";

export const MOCK_SCENARIO_NAMES: readonly MockScenarioName[] = [
  "zero",
  "one",
  "multiple",
  "connect_failure",
  "continuous_celsius",
  "stale",
  "fault",
  "unavailable",
  "out_of_range",
  "unexpected_disconnect",
] as const;

/** Stable identities — must not change across repeated scans. */
export const STABLE_PROBES = {
  a: { id: "mock-probe-a", name: "Alenio Probe A", rssi: -55 },
  b: { id: "mock-probe-b", name: "Alenio Probe B", rssi: -62 },
  c: { id: "mock-probe-c", name: "Alenio Probe C", rssi: -70 },
} as const satisfies Record<string, DiscoveredProbe>;

export type MockReadingTemplate = {
  status: ReadingStatus;
  /** Base Celsius; sequence offset applied for continuous scenarios. */
  celsius: number | null;
  /** When true, measuredAt is shifted into the past for stale detection. */
  ageMs?: number;
};

export type MockScenarioDefinition = {
  name: MockScenarioName;
  label: string;
  description: string;
  probes: DiscoveredProbe[];
  /** If true, connect() rejects. */
  connectFails: boolean;
  reading: MockReadingTemplate;
  /** Emit unexpected disconnect after this many reading ticks (null = never). */
  disconnectAfterTicks: number | null;
  /** Whether to keep emitting readings on an interval. */
  continuous: boolean;
};

export const SCENARIOS: Record<MockScenarioName, MockScenarioDefinition> = {
  zero: {
    name: "zero",
    label: "Zero probes",
    description: "Scan finds no devices",
    probes: [],
    connectFails: false,
    reading: { status: "unavailable", celsius: null },
    disconnectAfterTicks: null,
    continuous: false,
  },
  one: {
    name: "one",
    label: "One probe",
    description: "Single discoverable probe",
    probes: [STABLE_PROBES.a],
    connectFails: false,
    reading: { status: "ok", celsius: 21.5 },
    disconnectAfterTicks: null,
    continuous: true,
  },
  multiple: {
    name: "multiple",
    label: "Multiple probes",
    description: "Three stable discoverable probes",
    probes: [STABLE_PROBES.a, STABLE_PROBES.b, STABLE_PROBES.c],
    connectFails: false,
    reading: { status: "ok", celsius: 22.0 },
    disconnectAfterTicks: null,
    continuous: true,
  },
  connect_failure: {
    name: "connect_failure",
    label: "Connect failure",
    description: "Discovery succeeds; connect rejects",
    probes: [STABLE_PROBES.a],
    connectFails: true,
    reading: { status: "unavailable", celsius: null },
    disconnectAfterTicks: null,
    continuous: false,
  },
  continuous_celsius: {
    name: "continuous_celsius",
    label: "Continuous °C",
    description: "Deterministic streaming Celsius readings",
    probes: [STABLE_PROBES.a],
    connectFails: false,
    reading: { status: "ok", celsius: 20.0 },
    disconnectAfterTicks: null,
    continuous: true,
  },
  stale: {
    name: "stale",
    label: "Stale reading",
    description: "Samples aged beyond stale threshold",
    probes: [STABLE_PROBES.a],
    connectFails: false,
    reading: { status: "ok", celsius: 18.25, ageMs: 30_000 },
    disconnectAfterTicks: null,
    continuous: true,
  },
  fault: {
    name: "fault",
    label: "Fault reading",
    description: "Probe reports a sensor fault",
    probes: [STABLE_PROBES.a],
    connectFails: false,
    reading: { status: "fault", celsius: null },
    disconnectAfterTicks: null,
    continuous: true,
  },
  unavailable: {
    name: "unavailable",
    label: "Unavailable reading",
    description: "Probe connected but reading unavailable",
    probes: [STABLE_PROBES.a],
    connectFails: false,
    reading: { status: "unavailable", celsius: null },
    disconnectAfterTicks: null,
    continuous: true,
  },
  out_of_range: {
    name: "out_of_range",
    label: "Out of range",
    description: "Celsius outside validator bounds",
    probes: [STABLE_PROBES.a],
    connectFails: false,
    reading: { status: "ok", celsius: 420 },
    disconnectAfterTicks: null,
    continuous: true,
  },
  unexpected_disconnect: {
    name: "unexpected_disconnect",
    label: "Unexpected disconnect",
    description: "Drops after a few ticks to exercise reconnect",
    probes: [STABLE_PROBES.a],
    connectFails: false,
    reading: { status: "ok", celsius: 19.0 },
    disconnectAfterTicks: 3,
    continuous: true,
  },
};

export function getScenario(name: MockScenarioName): MockScenarioDefinition {
  return SCENARIOS[name];
}

/**
 * Deterministic Celsius series for continuous scenarios.
 * sequence 0 → base, then +0.1 each tick, wrapping every 10 steps.
 */
export function celsiusForSequence(base: number, sequence: number): number {
  return Math.round((base + (sequence % 10) * 0.1) * 10) / 10;
}
