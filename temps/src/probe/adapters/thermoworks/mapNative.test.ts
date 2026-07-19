import { describe, expect, it } from "vitest";
import {
  mapConnectionReason,
  mapDiscoveredDevices,
  mapNativeError,
  mapReadingEvent,
} from "./mapNative";

describe("mapNative", () => {
  it("maps discovered devices to ProbeId shape", () => {
    expect(
      mapDiscoveredDevices([
        {
          deviceId: "tw:abc",
          name: "ThermaPen Blue",
          deviceType: "PEN_BLUE",
          rssi: -60,
        },
        {
          deviceId: "tw:def",
          name: "TempTest Blue",
          deviceType: "TEMPTEST_BLUE",
        },
      ]),
    ).toEqual([
      { id: "tw:abc", name: "ThermaPen Blue", rssi: -60 },
      { id: "tw:def", name: "TempTest Blue", rssi: undefined },
    ]);
  });

  it("maps connection reasons for session reconnect policy", () => {
    expect(mapConnectionReason("manual")).toBe("manual");
    expect(mapConnectionReason("unexpected")).toBe("unexpected");
    expect(mapConnectionReason("shutdown")).toBe("unexpected");
    expect(mapConnectionReason("failed")).toBe("failed");
    expect(mapConnectionReason("timeout")).toBe("failed");
  });

  it("maps native error codes", () => {
    expect(mapNativeError("SCAN_FAILED", "no bt").code).toBe("SCAN_FAILED");
    expect(mapNativeError("CONNECT_FAILED", "nope", "tw:1")).toEqual({
      code: "CONNECT_FAILED",
      message: "nope",
      probeId: "tw:1",
    });
  });

  it("maps reading events to canonical Celsius TemperatureReading", () => {
    expect(
      mapReadingEvent({
        type: "reading",
        deviceId: "tw:1",
        sensorId: "1",
        temperatureC: 22.5,
        timestamp: 1_700_000_000_000,
        sequence: 3,
        battery: 88,
        status: "ok",
      }),
    ).toEqual({
      probeId: "tw:1",
      celsius: 22.5,
      status: "ok",
      measuredAt: 1_700_000_000_000,
      sequence: 3,
      sensorId: "1",
      batteryPercent: 88,
    });
  });

  it("maps NO_VALUE / fault readings to null celsius", () => {
    expect(
      mapReadingEvent({
        type: "reading",
        deviceId: "tw:1",
        temperatureC: null,
        timestamp: 1,
        status: "unavailable",
      }).celsius,
    ).toBeNull();

    expect(
      mapReadingEvent({
        type: "reading",
        deviceId: "tw:1",
        temperatureC: 12,
        timestamp: 1,
        status: "fault",
      }),
    ).toMatchObject({ celsius: null, status: "fault" });
  });
});
