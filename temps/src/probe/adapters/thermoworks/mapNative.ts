import type {
  DisconnectReason,
  DiscoveredProbe,
  ProbeError,
  ProbeErrorCode,
  TemperatureReading,
} from "../../core/types";
import type {
  ThermoworksConnectionReason,
  ThermoworksDiscoveredDevice,
  ThermoworksReadingEvent,
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

/**
 * Map native ThermaLib reading events to canonical ProbeSession readings.
 * `temperatureC` is already Celsius from the SDK (never convert from display strings).
 */
export function mapReadingEvent(event: ThermoworksReadingEvent): TemperatureReading {
  const temperature =
    event.temperatureC == null || Number.isNaN(event.temperatureC)
      ? null
      : event.temperatureC;

  const status =
    event.status === "fault"
      ? "fault"
      : event.status === "unavailable" || temperature == null
        ? "unavailable"
        : "ok";

  return {
    probeId: event.deviceId,
    celsius: status === "fault" || status === "unavailable" ? null : temperature,
    status,
    measuredAt: event.timestamp || Date.now(),
    sequence: event.sequence,
    sensorId: event.sensorId,
    batteryPercent:
      typeof event.battery === "number" && Number.isFinite(event.battery)
        ? event.battery
        : undefined,
  };
}
