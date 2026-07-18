import type {
  DisconnectReason,
  DiscoveredProbe,
  ProbeError,
  ProbeErrorCode,
} from "../../core/types";
import type {
  ThermoworksConnectionReason,
  ThermoworksDiscoveredDevice,
} from "./ThermoworksNative";

export function mapDiscoveredDevices(
  devices: ThermoworksDiscoveredDevice[],
): DiscoveredProbe[] {
  return devices.map((d) => ({
    id: d.deviceId,
    name: d.name,
    rssi: d.rssi,
  }));
}

export function mapConnectionReason(
  reason?: ThermoworksConnectionReason,
): DisconnectReason {
  switch (reason) {
    case "manual":
      return "manual";
    case "failed":
    case "auth":
    case "timeout":
      return "failed";
    case "unexpected":
    case "shutdown":
    case "no_bluetooth":
    case "unknown":
    default:
      return "unexpected";
  }
}

export function mapNativeError(
  code: string,
  message: string,
  deviceId?: string,
): ProbeError {
  const mapped: ProbeErrorCode =
    code === "SCAN_FAILED"
      ? "SCAN_FAILED"
      : code === "CONNECT_FAILED"
        ? "CONNECT_FAILED"
        : "ADAPTER_ERROR";
  return {
    code: mapped,
    message,
    probeId: deviceId,
  };
}
