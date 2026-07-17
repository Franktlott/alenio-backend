import { requireNativeModule } from "expo-modules-core";

export type ThermoworksInitResult = {
  ok: boolean;
  sdkVersion: string;
  bluetoothAvailable: boolean;
  error?: string;
};

export type ThermoworksDiagnostics = {
  module: "alenio-thermoworks";
  platform: "ios" | "android" | "unknown";
  sdkVersion: string | null;
  available: boolean;
  initialized: boolean;
  bluetoothAvailable: boolean;
  error?: string;
};

type NativeModule = {
  isAvailable(): boolean;
  initialize(): Promise<ThermoworksInitResult>;
  getDiagnostics(): Promise<ThermoworksDiagnostics>;
};

let cached: NativeModule | null | undefined;

/** Returns null when the native module is not present (e.g. Expo Go). */
export function getNativeOrNull(): NativeModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeModule>("AlenioThermoworks");
  } catch {
    cached = null;
  }
  return cached;
}
