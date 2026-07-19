import { describe, expect, it } from "vitest";
import { celsiusToUnit, formatTemperatureDigits, probeCelsiusToDigits } from "./temp-units";

describe("celsiusToUnit", () => {
  it("passes Celsius through", () => {
    expect(celsiusToUnit(20, "C")).toBe(20);
  });

  it("converts to Fahrenheit", () => {
    expect(celsiusToUnit(0, "F")).toBe(32);
    expect(celsiusToUnit(100, "F")).toBe(212);
  });
});

describe("formatTemperatureDigits", () => {
  it("formats integers without a decimal", () => {
    expect(formatTemperatureDigits(165)).toBe("165");
  });

  it("keeps one decimal when needed", () => {
    expect(formatTemperatureDigits(37.25)).toBe("37.3");
  });
});

describe("probeCelsiusToDigits", () => {
  it("formats probe Celsius into Fahrenheit digits", () => {
    expect(probeCelsiusToDigits(0, "F")).toBe("32");
    expect(probeCelsiusToDigits(73.9, "F")).toBe("165");
  });

  it("formats probe Celsius into Celsius digits", () => {
    expect(probeCelsiusToDigits(22.5, "C")).toBe("22.5");
  });
});
