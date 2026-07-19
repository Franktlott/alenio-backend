import {
  NativeModule,
  requireNativeModule,
  type EventSubscription,
} from "expo-modules-core";

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
  scanning?: boolean;
  discoveredCount?: number;
  connectedDeviceId?: string | null;
  error?: string;
};

export type ThermoworksDeviceType =
  | "PEN_BLUE"
  | "TEMPTEST_BLUE"
  | "UNKNOWN"
  | "OTHER";

export type ThermoworksDiscoveredDevice = {
  deviceId: string;
  name: string;
  rssi?: number;
  serialNumber?: string;
  deviceType: ThermoworksDeviceType;
};

export type ThermoworksDevicesEvent = {
  type: "devices";
  devices: ThermoworksDiscoveredDevice[];
};

export type ThermoworksConnectionState =
  | "connecting"
  | "connected"
  | "disconnecting"
  | "disconnected";

export type ThermoworksConnectionReason =
  | "manual"
  | "unexpected"
  | "failed"
  | "shutdown"
  | "timeout"
  | "no_bluetooth"
  | "auth"
  | "unknown";

export type ThermoworksConnectionEvent = {
  type: "connection";
  state: ThermoworksConnectionState;
  deviceId: string | null;
  reason?: ThermoworksConnectionReason;
  message?: string;
};

export type ThermoworksReadingStatus = "ok" | "fault" | "unavailable";

export type ThermoworksReadingEvent = {
  type: "reading";
  deviceId: string;
  sensorId?: string;
  temperatureC: number | null;
  timestamp: number;
  sequence?: number;
  battery?: number;
  status: ThermoworksReadingStatus;
  raw?: {
    isReady?: boolean;
    isFault?: boolean;
    source?: string;
    notificationType?: string;
  };
};

export type ThermoworksErrorEvent = {
  type: "error";
  code: string;
  message: string;
  deviceId?: string;
};

export type ThermoworksButtonPressEvent = {
  type: "buttonPress";
  deviceId: string;
  timestamp: number;
};

export type ThermoworksScanResult = {
  ok: boolean;
  error?: string;
};

type ThermoworksEvents = {
  onDevices: (event: ThermoworksDevicesEvent) => void;
  onError: (event: ThermoworksErrorEvent) => void;
  onConnection: (event: ThermoworksConnectionEvent) => void;
  onReading: (event: ThermoworksReadingEvent) => void;
  onButtonPress: (event: ThermoworksButtonPressEvent) => void;
};

type AlenioThermoworksNativeModule = NativeModule<ThermoworksEvents> & {
  isAvailable(): boolean;
  initialize(): Promise<ThermoworksInitResult>;
  getDiagnostics(): Promise<ThermoworksDiagnostics>;
  ensureBluetoothPermissions(): Promise<ThermoworksScanResult>;
  startScan(): Promise<ThermoworksScanResult>;
  stopScan(): Promise<ThermoworksScanResult>;
  connect(deviceId: string): Promise<ThermoworksScanResult>;
  disconnect(): Promise<ThermoworksScanResult>;
  getDiscoveredDevices(): Promise<ThermoworksDiscoveredDevice[]>;
  addListener<EventName extends keyof ThermoworksEvents>(
    eventName: EventName,
    listener: ThermoworksEvents[EventName],
  ): EventSubscription;
};

let cached: AlenioThermoworksNativeModule | null | undefined;

/** Returns null when the native module is not present (e.g. Expo Go). */
export function getNativeOrNull(): AlenioThermoworksNativeModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<AlenioThermoworksNativeModule>("AlenioThermoworks");
  } catch {
    cached = null;
  }
  return cached;
}
