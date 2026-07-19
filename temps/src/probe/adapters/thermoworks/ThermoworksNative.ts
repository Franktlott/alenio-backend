/**
 * Thin JS wrapper around the alenio-thermoworks Expo module.
 * Phase 3C: diagnostics + discovery + connect/disconnect + live °C readings.
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
  subscribeToButtonPress,
  subscribeToConnectionState,
  subscribeToDevices,
  subscribeToErrors,
  subscribeToReadings,
  type ThermoworksButtonPressEvent,
  type ThermoworksConnectionEvent,
  type ThermoworksConnectionReason,
  type ThermoworksConnectionState,
  type ThermoworksDiagnostics,
  type ThermoworksDiscoveredDevice,
  type ThermoworksDevicesEvent,
  type ThermoworksErrorEvent,
  type ThermoworksInitResult,
  type ThermoworksReadingEvent,
  type ThermoworksReadingStatus,
  type ThermoworksScanResult,
} from "alenio-thermoworks";
