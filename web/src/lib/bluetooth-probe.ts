/** Placeholder abstraction for future Bluetooth probe integration. */

export type ProbeReading = {
  tempF: number;
  source: "bluetooth" | "manual";
  capturedAt: string;
};

export type BluetoothProbeAdapter = {
  isSupported: () => boolean;
  connect: () => Promise<{ ok: boolean; message?: string }>;
  readTemperature: () => Promise<ProbeReading | null>;
  disconnect: () => Promise<void>;
};

export const bluetoothProbeAdapter: BluetoothProbeAdapter = {
  isSupported() {
    return false;
  },
  async connect() {
    return { ok: false, message: "Bluetooth probes are coming soon. Use manual entry for now." };
  },
  async readTemperature() {
    return null;
  },
  async disconnect() {
    /* no-op */
  },
};
