import {
  createContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  createProbeSystem,
  type ProbeSnapshot,
  type ProbeSystem,
} from "../core";
import { MockProbeAdapter, type MockScenarioName } from "../mock";

export type ProbeContextValue = {
  system: ProbeSystem;
  adapter: MockProbeAdapter;
  getSnapshot: () => ProbeSnapshot;
  subscribe: (onStoreChange: () => void) => () => void;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  connect: (probeId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setScenario: (name: MockScenarioName) => void;
  getScenarioName: () => MockScenarioName;
};

export const ProbeContext = createContext<ProbeContextValue | null>(null);

type ProbeProviderProps = {
  children: ReactNode;
  /** Initial mock scenario. */
  initialScenario?: MockScenarioName;
  readingIntervalMs?: number;
};

/**
 * Owns a mock probe system for the Probe Lab screen only.
 * Do not mount at the app root.
 */
export function ProbeProvider({
  children,
  initialScenario = "continuous_celsius",
  readingIntervalMs = 500,
}: ProbeProviderProps) {
  const adapterRef = useRef<MockProbeAdapter | null>(null);
  if (!adapterRef.current) {
    adapterRef.current = new MockProbeAdapter({
      scenario: initialScenario,
      readingIntervalMs,
    });
  }

  const system = useMemo(
    () =>
      createProbeSystem({
        adapter: adapterRef.current!,
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
      }),
    [],
  );

  useEffect(() => {
    return () => {
      system.dispose();
      adapterRef.current = null;
    };
  }, [system]);

  const value = useMemo<ProbeContextValue>(
    () => ({
      system,
      adapter: adapterRef.current!,
      getSnapshot: () => system.store.getSnapshot(),
      subscribe: (onStoreChange) =>
        system.store.subscribe(() => {
          onStoreChange();
        }),
      startScan: () => system.session.startScan(),
      stopScan: () => system.session.stopScan(),
      connect: (probeId) => system.session.connect(probeId),
      disconnect: () => system.session.disconnect(),
      setScenario: (name) => {
        adapterRef.current?.setScenario(name);
      },
      getScenarioName: () =>
        adapterRef.current?.getScenarioName() ?? initialScenario,
    }),
    [system, initialScenario],
  );

  return <ProbeContext.Provider value={value}>{children}</ProbeContext.Provider>;
}
