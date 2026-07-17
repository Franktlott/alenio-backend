import type { ReadingStatus, TemperatureReading } from "./types";

export type ReadingValidatorOptions = {
  /** Inclusive minimum valid Celsius. Default: -40 */
  minCelsius?: number;
  /** Inclusive maximum valid Celsius. Default: 300 */
  maxCelsius?: number;
  /** Mark readings older than this as stale. Default: 5000ms */
  staleAfterMs?: number;
  /** Clock injection for tests. */
  now?: () => number;
};

const TERMINAL: ReadonlySet<ReadingStatus> = new Set(["fault", "unavailable"]);

/**
 * Applies vendor-neutral quality rules to adapter readings.
 * Does not convert display units — Celsius only.
 */
export class ReadingValidator {
  private readonly minCelsius: number;
  private readonly maxCelsius: number;
  private readonly staleAfterMs: number;
  private readonly now: () => number;

  constructor(options: ReadingValidatorOptions = {}) {
    this.minCelsius = options.minCelsius ?? -40;
    this.maxCelsius = options.maxCelsius ?? 300;
    this.staleAfterMs = options.staleAfterMs ?? 5000;
    this.now = options.now ?? (() => Date.now());
  }

  validate(reading: TemperatureReading): TemperatureReading {
    if (TERMINAL.has(reading.status)) {
      return reading;
    }

    if (reading.celsius == null || Number.isNaN(reading.celsius)) {
      return { ...reading, celsius: null, status: "unavailable" };
    }

    if (reading.celsius < this.minCelsius || reading.celsius > this.maxCelsius) {
      return { ...reading, status: "out_of_range" };
    }

    const age = this.now() - reading.measuredAt;
    if (age > this.staleAfterMs) {
      return { ...reading, status: "stale" };
    }

    if (reading.status === "stale" || reading.status === "out_of_range") {
      return { ...reading, status: reading.status };
    }

    return { ...reading, status: "ok" };
  }
}
