import { describe, expect, it } from "vitest";
import {
  mapConnectionReason,
  mapDiscoveredDevices,
  mapNativeError,
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
      ]),
    ).toEqual([{ id: "tw:abc", name: "ThermaPen Blue", rssi: -60 }]);
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
});
