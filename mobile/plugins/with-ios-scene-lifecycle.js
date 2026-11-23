const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

/**
 * Expo SDK 56 apps built with the iOS 27 SDK crash at launch unless they
 * adopt UIKit's scene lifecycle. Official scene support lands in SDK 57.23+ /
 * SDK 58; this keeps local Duo / Xcode 27 builds launching until then.
 */

const SCENE_DELEGATE_MARKER = "class SceneDelegate: UIResponder, UIWindowSceneDelegate";

const SCENE_CONFIGURATION_METHOD = `
  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
`;

const SCENE_DELEGATE_CLASS = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let nextWindow = UIWindow(windowScene: windowScene)
    window = nextWindow
    appDelegate.window = nextWindow

    factory.startReactNative(
      withModuleName: "main",
      in: nextWindow,
      launchOptions: nil
    )

    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    if let userActivity = connectionOptions.userActivities.first {
      self.scene(scene, continue: userActivity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let urlContext = URLContexts.first,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }

    var options: [UIApplication.OpenURLOptionsKey: Any] = [
      .openInPlace: urlContext.options.openInPlace,
    ]
    if let sourceApplication = urlContext.options.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = urlContext.options.annotation {
      options[.annotation] = annotation
    }
    _ = appDelegate.application(UIApplication.shared, open: urlContext.url, options: options)
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }
}
`;

function patchAppDelegate(contents) {
  let next = contents;

  const startupBlockPattern =
    /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif/;

  if (startupBlockPattern.test(next)) {
    next = next.replace(
      startupBlockPattern,
      `// Window + React Native start in SceneDelegate (required by iOS 27 SDK).`,
    );
  }

  if (!next.includes("configurationForConnecting connectingSceneSession")) {
    const linkingMarker = "\n  // Linking API";
    if (next.includes(linkingMarker)) {
      next = next.replace(
        linkingMarker,
        `\n${SCENE_CONFIGURATION_METHOD}\n  // Linking API`,
      );
    }
  }

  if (!next.includes(SCENE_DELEGATE_MARKER)) {
    const reactNativeDelegateMarker =
      "\nclass ReactNativeDelegate: ExpoReactNativeFactoryDelegate";
    if (!next.includes(reactNativeDelegateMarker)) {
      throw new Error(
        "with-ios-scene-lifecycle: could not find ReactNativeDelegate to insert SceneDelegate.",
      );
    }
    next = next.replace(
      reactNativeDelegateMarker,
      `\n${SCENE_DELEGATE_CLASS}${reactNativeDelegateMarker}`,
    );
  }

  return next;
}

module.exports = function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
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
    return cfg;
  });

  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error(
        "with-ios-scene-lifecycle: expected a Swift AppDelegate, got " +
          cfg.modResults.language,
      );
    }
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents);
    return cfg;
  });
};
