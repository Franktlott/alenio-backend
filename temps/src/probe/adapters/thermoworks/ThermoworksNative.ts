/**
 * Thin JS wrapper around the alenio-thermoworks Expo module.
 * Phase 3B: diagnostics + discovery + connect/disconnect. No readings yet.
 */
export {
  connect,
  disconnect,
  ensureBluetoothPermissions,
  getDiagnostics,
  getDiscoveredDevices,
  initialize,
  isAvailable,
  startScan,
  stopScan,
  subscribeToConnectionState,
  subscribeToDevices,
  subscribeToErrors,
  type ThermoworksConnectionEvent,
  type ThermoworksConnectionReason,
  type ThermoworksConnectionState,
  type ThermoworksDiagnostics,
  type ThermoworksDiscoveredDevice,
  type ThermoworksDevicesEvent,
  type ThermoworksErrorEvent,
  type ThermoworksInitResult,
  type ThermoworksScanResult,
} from "alenio-thermoworks";
