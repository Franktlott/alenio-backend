/** Probe adapter stub — Phase 3 ships manual entry only. Bluetooth comes later. */

export type TemperatureProbeSource = "manual" | "bluetooth";

export type TemperatureProbeReading = {
  value: number;
  unit: "F" | "C";
  source: TemperatureProbeSource;
};

export type TemperatureProbeAdapter = {
  readonly kind: TemperatureProbeSource;
  readonly available: boolean;
  read(): Promise<TemperatureProbeReading | null>;
};

export const manualTemperatureProbeAdapter: TemperatureProbeAdapter = {
  kind: "manual",
  available: true,
  async read() {
    // Manual entry is collected by the runner UI; this adapter does not auto-read.
    return null;
  },
};

export function getTemperatureProbeAdapter(preferBluetooth = false): TemperatureProbeAdapter {
  if (preferBluetooth) {
    // Stub: Bluetooth probe not wired yet.
    return manualTemperatureProbeAdapter;
  }
  return manualTemperatureProbeAdapter;
}
