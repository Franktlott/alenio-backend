/** Convert canonical Celsius to the check item's display/storage unit. */
export function celsiusToUnit(celsius: number, unit: "F" | "C"): number {
  if (unit === "C") return celsius;
  return (celsius * 9) / 5 + 32;
}

/**
 * Format a temperature for the check keypad `digits` field.
 * One decimal place when needed; max length matches the keypad (6).
 */
export function formatTemperatureDigits(value: number, maxLen = 6): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 10) / 10;
  const raw =
    Math.abs(rounded - Math.trunc(rounded)) < 1e-9
      ? String(Math.trunc(rounded))
      : rounded.toFixed(1);
  return raw.length <= maxLen ? raw : String(Math.round(rounded)).slice(0, maxLen);
}

/** Probe reading (°C) → keypad digit string in the item unit. */
export function probeCelsiusToDigits(celsius: number, unit: "F" | "C"): string {
  return formatTemperatureDigits(celsiusToUnit(celsius, unit));
}
