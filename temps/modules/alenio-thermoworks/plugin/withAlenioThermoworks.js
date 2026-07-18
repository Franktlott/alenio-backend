const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withGradleProperties,
  withInfoPlist,
  withPodfile,
} = require("expo/config-plugins");
const {
  mergeContents,
} = require("@expo/config-plugins/build/utils/generateCode");

const BLUETOOTH_USAGE =
  "Alenio Temps uses Bluetooth to communicate with ThermoWorks temperature probes.";

const IOS_DEPLOYMENT_TARGET = "16.4";

/**
 * Append a CocoaPods post_install adjustment after react_native_post_install
 * so every pod target/config below 16.4 is raised (fixes Xcode 27 rejecting 13.4).
 */
function withPodsDeploymentTarget(config) {
  return withPodfile(config, (cfg) => {
    const tag = "alenio-pods-deployment-target";
    const newSrc = `
    # Raise CocoaPods IPHONEOS_DEPLOYMENT_TARGET to the app minimum when lower.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        current = config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"]
        if current.nil? || Gem::Version.new(current.to_s) < Gem::Version.new("${IOS_DEPLOYMENT_TARGET}")
          config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "${IOS_DEPLOYMENT_TARGET}"
        end
      end
    end`;

    try {
      const result = mergeContents({
        src: cfg.modResults.contents,
        newSrc,
        tag,
        // Single-line anchor inside the stock Expo post_install / react_native_post_install call.
        anchor: /^\s*:ccache_enabled => ccache_enabled\?\(podfile_properties\),/,
        // Insert after the closing `)` of react_native_post_install(...).
        offset: 2,
        comment: "#",
      });
      if (result.didMerge || result.didClear) {
        cfg.modResults.contents = result.contents;
      }
    } catch (error) {
      if (error.code === "ERR_NO_MATCH") {
        throw new Error(
          "alenio-thermoworks: could not find react_native_post_install ccache line in Podfile to inject deployment-target fix. " +
            "Report this with a copy of ios/Podfile.",
        );
      }
      throw error;
    }

    return cfg;
  });
}

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

  config = withPodsDeploymentTarget(config);

  return config;
}

module.exports = createRunOncePlugin(
  withAlenioThermoworks,
  "alenio-thermoworks",
  "0.1.1",
);
