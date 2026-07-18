import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createProbeSystem,
  type ProbeAdapter,
  type ProbeSnapshot,
  type ProbeSystem,
} from "../core";
import { MockProbeAdapter, type MockScenarioName } from "../mock";
import { ThermoworksProbeAdapter } from "../adapters/thermoworks";

export type ProbeSource = "mock" | "thermoworks";

export type ProbeContextValue = {
  source: ProbeSource;
  setSource: (source: ProbeSource) => void;
  system: ProbeSystem;
  adapter: ProbeAdapter;
  getSnapshot: () => ProbeSnapshot;
  subscribe: (onStoreChange: () => void) => () => void;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  connect: (probeId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Mock-only helpers (no-ops for ThermoWorks). */
  setScenario: (name: MockScenarioName) => void;
  getScenarioName: () => MockScenarioName;
};

export const ProbeContext = createContext<ProbeContextValue | null>(null);

type ProbeProviderProps = {
  children: ReactNode;
  initialSource?: ProbeSource;
  /** Initial mock scenario. */
  initialScenario?: MockScenarioName;
  readingIntervalMs?: number;
};

type Bundle = {
  system: ProbeSystem;
  adapter: ProbeAdapter;
  mock: MockProbeAdapter | null;
};

function buildSystem(
  source: ProbeSource,
  initialScenario: MockScenarioName,
  readingIntervalMs: number,
): Bundle {
  const adapter: ProbeAdapter =
    source === "thermoworks"
      ? new ThermoworksProbeAdapter()
      : new MockProbeAdapter({
          scenario: initialScenario,
          readingIntervalMs,
        });

  const system = createProbeSystem({
    adapter,
    reconnectPolicy: {
      maxAttempts: 5,
      initialDelayMs: 300,
      maxDelayMs: 4000,
      multiplier: 2,
      jitterRatio: 0.2,
    },
    validator: {
      staleAfterMs: 5000,
      minCelsius: -40,
      maxCelsius: 300,
    },
  });

  return {
    system,
    adapter,
    mock: source === "mock" ? (adapter as MockProbeAdapter) : null,
  };
}

/**
 * Owns a probe system for the Probe Lab screen only.
 * Do not mount at the app root.
 */
export function ProbeProvider({
  children,
  initialSource = "mock",
  initialScenario = "continuous_celsius",
  readingIntervalMs = 500,
}: ProbeProviderProps) {
  const [source, setSourceState] = useState<ProbeSource>(initialSource);
  const bundleRef = useRef<Bundle>(
    buildSystem(initialSource, initialScenario, readingIntervalMs),
  );
  const [epoch, setEpoch] = useState(0);

  const setSource = useCallback(
    (next: ProbeSource) => {
      setSourceState((prev) => {
        if (prev === next) return prev;
        bundleRef.current.system.dispose();
        bundleRef.current = buildSystem(next, initialScenario, readingIntervalMs);
        setEpoch((e) => e + 1);
        return next;
      });
    },
    [initialScenario, readingIntervalMs],
  );

  useEffect(() => {
    return () => {
      bundleRef.current.system.dispose();
    };
  }, []);

  const bundle = bundleRef.current;

  const value = useMemo<ProbeContextValue>(
    () => ({
      source,
      setSource,
      system: bundle.system,
      adapter: bundle.adapter,
      getSnapshot: () => bundle.system.store.getSnapshot(),
      subscribe: (onStoreChange) =>
        bundle.system.store.subscribe(() => {
          onStoreChange();
        }),
      startScan: () => bundle.system.session.startScan(),
      stopScan: () => bundle.system.session.stopScan(),
      connect: (probeId) => bundle.system.session.connect(probeId),
      disconnect: () => bundle.system.session.disconnect(),
      setScenario: (name) => {
        bundle.mock?.setScenario(name);
      },
      getScenarioName: () =>
        bundle.mock?.getScenarioName() ?? initialScenario,
    }),
    [source, setSource, bundle, initialScenario, epoch],
  );

  return <ProbeContext.Provider value={value}>{children}</ProbeContext.Provider>;
}
