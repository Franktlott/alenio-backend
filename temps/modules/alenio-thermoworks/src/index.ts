import {
  getNativeOrNull,
  type ThermoworksDiagnostics,
  type ThermoworksInitResult,
} from "./AlenioThermoworksModule";

export type { ThermoworksDiagnostics, ThermoworksInitResult };

function unavailableDiagnostics(error?: string): ThermoworksDiagnostics {
  return {
    module: "alenio-thermoworks",
    platform: "unknown",
    sdkVersion: null,
    available: false,
    initialized: false,
    bluetoothAvailable: false,
    error: error ?? "Native module AlenioThermoworks is not available",
  };
}

export function isAvailable(): boolean {
  const native = getNativeOrNull();
  if (!native) return false;
  try {
    return native.isAvailable();
  } catch {
    return false;
  }
}

export async function initialize(): Promise<ThermoworksInitResult> {
  const native = getNativeOrNull();
  if (!native) {
    return {
      ok: false,
      sdkVersion: "",
      bluetoothAvailable: false,
      error: "Native module AlenioThermoworks is not available",
    };
  }
  return native.initialize();
}

export async function getDiagnostics(): Promise<ThermoworksDiagnostics> {
  const native = getNativeOrNull();
  if (!native) {
    return unavailableDiagnostics();
  }
  try {
    return await native.getDiagnostics();
  } catch (err) {
    return unavailableDiagnostics(
      err instanceof Error ? err.message : String(err),
    );
  }
}
