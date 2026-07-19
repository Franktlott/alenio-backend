import { z } from "zod";
import type { WalkItemResponseStatus } from "../types";

export const temperatureConfigSchema = z.object({
  comparisonType: z.enum(["ABOVE", "BELOW", "BETWEEN"]),
  minimumTemperature: z.number().optional().nullable(),
  maximumTemperature: z.number().optional().nullable(),
  unit: z.enum(["F", "C"]).default("F"),
  allowManualEntry: z.boolean().default(true),
  allowBluetoothProbe: z.boolean().default(true),
  requireRetestOnFailure: z.boolean().default(false),
  maximumRetests: z.number().int().min(0).max(10).default(1),
  /** Optional guidance shown to associates during retemp (e.g. "Retemp 2 additional products"). */
  retestGuidance: z.string().max(500).optional().nullable(),
});

export type TemperatureConfig = z.infer<typeof temperatureConfigSchema>;

export const temperatureResponseSchema = z.object({
  value: z.number(),
  unit: z.enum(["F", "C"]).optional(),
  source: z.enum(["manual", "bluetooth"]).default("manual"),
  retestCount: z.number().int().min(0).optional(),
});

export type TemperatureResponse = z.infer<typeof temperatureResponseSchema>;

export const DEFAULT_TEMPERATURE_CONFIG: TemperatureConfig = {
  comparisonType: "ABOVE",
  minimumTemperature: 165,
  maximumTemperature: null,
  unit: "F",
  allowManualEntry: true,
  allowBluetoothProbe: true,
  requireRetestOnFailure: false,
  maximumRetests: 1,
  retestGuidance: null,
};

/** Convert a reading into the config's comparison unit. */
export function toConfigUnit(
  value: number,
  fromUnit: "F" | "C",
  toUnit: "F" | "C",
): number {
  if (fromUnit === toUnit) return value;
  if (fromUnit === "C" && toUnit === "F") return (value * 9) / 5 + 32;
  return ((value - 32) * 5) / 9;
}

export function evaluateTemperature(
  config: TemperatureConfig,
  response: TemperatureResponse,
): WalkItemResponseStatus {
  const configUnit = config.unit ?? "F";
  const responseUnit = response.unit ?? configUnit;
  const value = toConfigUnit(response.value, responseUnit, configUnit);
  const { comparisonType, minimumTemperature, maximumTemperature } = config;

  let pass = false;
  if (comparisonType === "ABOVE") {
    pass = minimumTemperature != null && value >= minimumTemperature;
  } else if (comparisonType === "BELOW") {
    pass = maximumTemperature != null && value <= maximumTemperature;
  } else {
    pass =
      minimumTemperature != null &&
      maximumTemperature != null &&
      value >= minimumTemperature &&
      value <= maximumTemperature;
  }

  return pass ? "PASS" : "FAIL";
}
