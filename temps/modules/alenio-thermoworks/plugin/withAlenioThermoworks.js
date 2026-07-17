const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withGradleProperties,
  withInfoPlist,
} = require("expo/config-plugins");

const BLUETOOTH_USAGE =
  "Alenio Temps uses Bluetooth to communicate with ThermoWorks temperature probes.";

function setBluetoothScanNeverForLocation(androidManifest) {
  const manifest = androidManifest.manifest;
  if (!manifest["uses-permission"]) {
    manifest["uses-permission"] = [];
  }

  const permissions = manifest["uses-permission"];
  const scanName = "android.permission.BLUETOOTH_SCAN";
  let scan = permissions.find((p) => p.$?.["android:name"] === scanName);
  if (!scan) {
    scan = { $: { "android:name": scanName } };
    permissions.push(scan);
  }
  scan.$["android:usesPermissionFlags"] = "neverForLocation";

  // Legacy BT permissions limited to pre-31.
  for (const name of [
    "android.permission.BLUETOOTH",
    "android.permission.BLUETOOTH_ADMIN",
  ]) {
    let entry = permissions.find((p) => p.$?.["android:name"] === name);
    if (!entry) {
      entry = { $: { "android:name": name } };
      permissions.push(entry);
    }
    entry.$["android:maxSdkVersion"] = "30";
  }

  if (!manifest["uses-feature"]) {
    manifest["uses-feature"] = [];
  }
  const features = manifest["uses-feature"];
  const bleName = "android.hardware.bluetooth_le";
  let ble = features.find((f) => f.$?.["android:name"] === bleName);
  if (!ble) {
    ble = { $: { "android:name": bleName } };
    features.push(ble);
  }
  ble.$["android:required"] = "false";

  return androidManifest;
}

function withAlenioThermoworks(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSBluetoothAlwaysUsageDescription =
      cfg.modResults.NSBluetoothAlwaysUsageDescription || BLUETOOTH_USAGE;
    cfg.modResults.NSBluetoothPeripheralUsageDescription =
      cfg.modResults.NSBluetoothPeripheralUsageDescription || BLUETOOTH_USAGE;
    return cfg;
  });

  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.BLUETOOTH",
    "android.permission.BLUETOOTH_ADMIN",
    "android.permission.BLUETOOTH_CONNECT",
    "android.permission.BLUETOOTH_SCAN",
    "android.permission.ACCESS_FINE_LOCATION",
  ]);

  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = setBluetoothScanNeverForLocation(cfg.modResults);
    return cfg;
  });

  config = withGradleProperties(config, (cfg) => {
    const key = "android.enableJetifier";
    const existing = cfg.modResults.find((item) => item.key === key);
    if (existing) {
      existing.value = "true";
    } else {
      cfg.modResults.push({ type: "property", key, value: "true" });
    }
    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withAlenioThermoworks,
  "alenio-thermoworks",
  "0.1.0",
);
