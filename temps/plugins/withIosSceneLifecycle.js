/**
 * Adopts the UIKit scene-based life cycle required by the iOS 27 SDK.
 *
 * Stable Expo SDK 56 prebuild still emits the legacy AppDelegate/window template
 * (see expo/expo#46664). Upstream fix lands SceneDelegate + UIApplicationSceneManifest
 * in the bare-minimum template; until that ships on npm, this plugin mirrors it.
 *
 * Requires ExpoAppSceneDelegate / ExpoReactNativeFactoryProvider (patched into `expo`
 * via patch-package until a published expo release includes them).
 */
const {
  IOSConfig,
  createRunOncePlugin,
  withAppDelegate,
  withInfoPlist,
} = require("expo/config-plugins");

const SCENE_DELEGATE_CONTENTS = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
};

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return cfg;
  });
}

function withSceneDelegateFile(config) {
  return IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: "SceneDelegate.swift",
    contents: SCENE_DELEGATE_CONTENTS,
    overwrite: true,
  });
}

function adoptSceneLifecycleAppDelegate(contents) {
  let next = contents;

  if (!next.includes("ExpoReactNativeFactoryProvider")) {
    next = next.replace(
      /class AppDelegate:\s*ExpoAppDelegate\b/,
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider",
    );
  }

  // Move window + startReactNative into SceneDelegate (iOS 27 SDK requirement).
  next = next.replace(
    /\s*#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)\s*#endif\s*/m,
    "\n    // The window is created and React Native is started by `SceneDelegate` under the\n" +
      "    // scene-based life cycle (required by the iOS 27 SDK).\n\n    ",
  );

  // Deep/universal links are delivered via the scene delegate under UIScene.
  next = next.replace(
    /\n\s*\/\/ Linking API\n\s*public override func application\(\s*_ app: UIApplication,\s*open url: URL,\s*options: \[UIApplication\.OpenURLOptionsKey: Any\] = \[\:\]\s*\) -> Bool \{[\s\S]*?\n\s*\}\n/m,
    "\n",
  );
  next = next.replace(
    /\n\s*\/\/ Universal Links\n\s*public override func application\(\s*_ application: UIApplication,\s*continue userActivity: NSUserActivity,\s*restorationHandler: @escaping \(\[UIUserActivityRestoring\]\?\) -> Void\s*\) -> Bool \{[\s\S]*?\n\s*\}\n/m,
    "\n",
  );

  if (next.includes("factory.startReactNative(") && next.includes("UIWindow(frame:")) {
    throw new Error(
      "withIosSceneLifecycle: failed to strip legacy window bootstrap from AppDelegate.swift. " +
        "Update the plugin for the current Expo AppDelegate template.",
    );
  }

  if (!next.includes("ExpoReactNativeFactoryProvider")) {
    throw new Error(
      "withIosSceneLifecycle: failed to add ExpoReactNativeFactoryProvider to AppDelegate.",
    );
  }

  return next;
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error("withIosSceneLifecycle: expected a Swift AppDelegate.");
    }
    cfg.modResults.contents = adoptSceneLifecycleAppDelegate(cfg.modResults.contents);
    return cfg;
  });
}

function withIosSceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneDelegateFile(config);
  config = withSceneAppDelegate(config);
  return config;
}

module.exports = createRunOncePlugin(
  withIosSceneLifecycle,
  "withIosSceneLifecycle",
  "1.0.0",
);
