import { describe, expect, it } from "vitest";
import { ReadingValidator } from "./ReadingValidator";
import type { TemperatureReading } from "./types";

function reading(
  partial: Partial<TemperatureReading> & Pick<TemperatureReading, "status">,
): TemperatureReading {
  return {
    probeId: "mock-probe-a",
    celsius: 20,
    measuredAt: 1_000_000,
    sequence: 0,
    ...partial,
  };
}

describe("ReadingValidator", () => {
  it("keeps fault and unavailable statuses", () => {
    const v = new ReadingValidator({ now: () => 1_000_000 });
    expect(v.validate(reading({ status: "fault", celsius: null })).status).toBe(
      "fault",
    );
    expect(
      v.validate(reading({ status: "unavailable", celsius: null })).status,
    ).toBe("unavailable");
  });

  it("marks null celsius as unavailable", () => {
    const v = new ReadingValidator({ now: () => 1_000_000 });
    expect(v.validate(reading({ status: "ok", celsius: null })).status).toBe(
      "unavailable",
    );
  });

  it("marks out-of-range Celsius", () => {
    const v = new ReadingValidator({
      now: () => 1_000_000,
      minCelsius: -40,
      maxCelsius: 300,
    });
    expect(v.validate(reading({ status: "ok", celsius: 420 })).status).toBe(
      "out_of_range",
    );
    expect(v.validate(reading({ status: "ok", celsius: -50 })).status).toBe(
      "out_of_range",
    );
  });

  it("marks stale when age exceeds threshold", () => {
    const v = new ReadingValidator({
      now: () => 1_000_000,
      staleAfterMs: 5_000,
    });
    expect(
      v.validate(
        reading({ status: "ok", celsius: 21, measuredAt: 1_000_000 - 6_000 }),
      ).status,
    ).toBe("stale");
  });

  it("accepts fresh in-range Celsius as ok", () => {
    const v = new ReadingValidator({ now: () => 1_000_000 });
    expect(
      v.validate(reading({ status: "ok", celsius: 21.5, measuredAt: 999_500 }))
        .status,
    ).toBe("ok");
  });

  it("does not convert display units — preserves Celsius number", () => {
    const v = new ReadingValidator({ now: () => 1_000_000 });
    const result = v.validate(reading({ status: "ok", celsius: 37.0 }));
    expect(result.celsius).toBe(37.0);
  });
});
