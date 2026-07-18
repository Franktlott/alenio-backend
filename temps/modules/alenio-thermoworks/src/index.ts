import {
  getNativeOrNull,
  type ThermoworksConnectionEvent,
  type ThermoworksDiagnostics,
  type ThermoworksDiscoveredDevice,
  type ThermoworksDevicesEvent,
  type ThermoworksErrorEvent,
  type ThermoworksInitResult,
  type ThermoworksScanResult,
} from "./AlenioThermoworksModule";

export type {
  ThermoworksConnectionEvent,
  ThermoworksConnectionReason,
  ThermoworksConnectionState,
  ThermoworksDiagnostics,
  ThermoworksDiscoveredDevice,
  ThermoworksDevicesEvent,
  ThermoworksErrorEvent,
  ThermoworksInitResult,
  ThermoworksScanResult,
  ThermoworksDeviceType,
} from "./AlenioThermoworksModule";

function unavailableDiagnostics(error?: string): ThermoworksDiagnostics {
  return {
    module: "alenio-thermoworks",
    platform: "unknown",
    sdkVersion: null,
    available: false,
    initialized: false,
    bluetoothAvailable: false,
    scanning: false,
    discoveredCount: 0,
    connectedDeviceId: null,
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

export async function ensureBluetoothPermissions(): Promise<ThermoworksScanResult> {
  const native = getNativeOrNull();
  if (!native) {
    return { ok: false, error: "Native module AlenioThermoworks is not available" };
  }
  return native.ensureBluetoothPermissions();
}

export async function startScan(): Promise<ThermoworksScanResult> {
  const native = getNativeOrNull();
  if (!native) {
    return { ok: false, error: "Native module AlenioThermoworks is not available" };
  }
  if (__DEV__) console.debug("[AlenioThermoworks] startScan");
  return native.startScan();
}

export async function stopScan(): Promise<ThermoworksScanResult> {
  const native = getNativeOrNull();
  if (!native) {
    return { ok: false, error: "Native module AlenioThermoworks is not available" };
  }
  if (__DEV__) console.debug("[AlenioThermoworks] stopScan");
  return native.stopScan();
}

export async function connect(deviceId: string): Promise<ThermoworksScanResult> {
  const native = getNativeOrNull();
  if (!native) {
    return { ok: false, error: "Native module AlenioThermoworks is not available" };
  }
  if (__DEV__) console.debug("[AlenioThermoworks] connect", deviceId);
  return native.connect(deviceId);
}

export async function disconnect(): Promise<ThermoworksScanResult> {
  const native = getNativeOrNull();
  if (!native) {
    return { ok: false, error: "Native module AlenioThermoworks is not available" };
  }
  if (__DEV__) console.debug("[AlenioThermoworks] disconnect");
  return native.disconnect();
}

export async function getDiscoveredDevices(): Promise<ThermoworksDiscoveredDevice[]> {
  const native = getNativeOrNull();
  if (!native) return [];
  try {
    return await native.getDiscoveredDevices();
  } catch {
    return [];
  }
}

export function subscribeToDevices(
  listener: (devices: ThermoworksDiscoveredDevice[]) => void,
): () => void {
  const native = getNativeOrNull();
  if (!native) return () => undefined;
  const sub = native.addListener("onDevices", (event: ThermoworksDevicesEvent) => {
    if (__DEV__) {
      console.debug(
        "[AlenioThermoworks] onDevices",
        event.devices?.map((d) => `${d.deviceId}:${d.deviceType}`).join(", ") ??
          "(empty)",
      );
    }
    listener(event.devices ?? []);
  });
  return () => sub.remove();
}

export function subscribeToConnectionState(
  listener: (event: ThermoworksConnectionEvent) => void,
): () => void {
  const native = getNativeOrNull();
  if (!native) return () => undefined;
  const sub = native.addListener("onConnection", (event: ThermoworksConnectionEvent) => {
    if (__DEV__) {
      console.debug(
        "[AlenioThermoworks] onConnection",
        event.state,
        event.deviceId,
        event.reason ?? "",
      );
    }
    listener(event);
  });
  return () => sub.remove();
}

export function subscribeToErrors(
  listener: (error: ThermoworksErrorEvent) => void,
): () => void {
  const native = getNativeOrNull();
  if (!native) return () => undefined;
  const sub = native.addListener("onError", (event: ThermoworksErrorEvent) => {
    if (__DEV__) {
      console.debug("[AlenioThermoworks] onError", event.code, event.message);
    }
    listener(event);
  });
  return () => sub.remove();
}
