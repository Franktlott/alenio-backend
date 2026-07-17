import { useContext, useMemo, useSyncExternalStore } from "react";
import type { ProbeSnapshot } from "../core";
import { MOCK_SCENARIO_NAMES, type MockScenarioName } from "../mock";
import { ProbeContext, type ProbeContextValue } from "./ProbeProvider";

export type UseProbeResult = ProbeContextValue & {
  snapshot: ProbeSnapshot;
  scenarios: readonly MockScenarioName[];
};

export function useProbe(): UseProbeResult {
  const ctx = useContext(ProbeContext);
  if (!ctx) {
    throw new Error("useProbe must be used within ProbeProvider (Probe Lab only)");
  }

  const snapshot = useSyncExternalStore(
    ctx.subscribe,
    ctx.getSnapshot,
    ctx.getSnapshot,
  );

  return useMemo(
    () => ({
      ...ctx,
      snapshot,
      scenarios: MOCK_SCENARIO_NAMES,
    }),
    [ctx, snapshot],
  );
}
