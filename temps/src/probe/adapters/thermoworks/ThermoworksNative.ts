/**
 * Thin JS wrapper around the alenio-thermoworks Expo module.
 * Phase 2: diagnostics only — no scan/connect/readings.
 */
export {
  getDiagnostics,
  initialize,
  isAvailable,
  type ThermoworksDiagnostics,
  type ThermoworksInitResult,
} from "alenio-thermoworks";
