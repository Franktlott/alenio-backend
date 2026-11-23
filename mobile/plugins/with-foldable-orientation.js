const { withAppDelegate } = require("expo/config-plugins");

/**
 * Teaches iOS the app's rotation rule: phone-sized displays stay upright,
 * anything tablet-sized or unfolded turns with the device.
 *
 * This has to live in native code. The `orientation` option on the navigators
 * is the documented way to do it, but react-native-screens delivers it by
 * attaching to the root view controller and searching one level down for its
 * navigator. The Expo dev client inserts view controllers into that chain, the
 * search misses, and iOS is quietly told every orientation is fine. Measured on
 * a folded iPhone Duo: the app asked for portrait and launched in landscape.
 *
 * Deciding it from the window size keeps it independent of that hierarchy, and
 * of the view controller UIKit happens to ask. The shortest side is used
 * because it is the one measurement a rotation cannot change, so the answer
 * does not flip midway through turning the device.
 */

/** Keep in step with `ROTATES_ABOVE` in `src/lib/screen-rotation.ts`. */
const ROTATES_ABOVE = 500;

const MARKER = "alenioSupportedOrientations";

const APP_DELEGATE_ANCHOR = "class AppDelegate: ExpoAppDelegate {";
const SCENE_DELEGATE_ANCHOR =
  "class SceneDelegate: UIResponder, UIWindowSceneDelegate {";

const APP_DELEGATE_BODY = `
  /// The shortest side a display needs before the app will rotate with it.
  /// Mirrors ROTATES_ABOVE in src/lib/screen-rotation.ts.
  static let ${MARKER}Threshold: CGFloat = ${ROTATES_ABOVE}

  private static var alenioOrientationUpdatesStarted = false

  /// UIDevice.orientation stays stale while the app is portrait-locked unless
  /// something is listening for it. Started once, the first time UIKit asks.
  static func alenioStartOrientationUpdates() {
    guard !alenioOrientationUpdatesStarted else { return }
    alenioOrientationUpdatesStarted = true
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
  }

  static func alenioRotates(size: CGSize) -> Bool {
    min(size.width, size.height) >= ${MARKER}Threshold
  }

  private static var alenioHingeOpen = false
  private static var alenioHingeKnown = false
  private static var alenioHingeAttached = false
  private static var alenioHingeObserver: AlenioHingeObserver?

  static var alenioHingeIsOpen: Bool { alenioHingeOpen }
  static var alenioHingeIsKnownClosed: Bool { alenioHingeKnown && !alenioHingeOpen }

  static func alenioAttachHinge(to view: UIView?) {
    guard let view, !alenioHingeAttached else { return }
    alenioHingeAttached = true
    let observer = AlenioHingeObserver()
    observer.start(on: view) { status, _ in
      guard status != "unknown" else { return }
      let open = status == "fullyOpen" || status == "partiallyOpen"
      let wasOpen = alenioHingeOpen
      let wasKnown = alenioHingeKnown
      alenioHingeKnown = true
      alenioHingeOpen = open
      if open != wasOpen || !wasKnown {
        DispatchQueue.main.async {
          view.window?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        }
      }
    }
    alenioHingeObserver = observer
  }

  /// The status bar is the upright edge, folded or open. Locking the cover
  /// to landscape letterboxes the app. A normal phone stays portrait.
  static func ${MARKER}(for window: UIWindow?) -> UIInterfaceOrientationMask {
    alenioStartOrientationUpdates()
    alenioAttachHinge(to: window)
    let size = window?.windowScene?.coordinateSpace.bounds.size ?? window?.bounds.size
    guard let size, size.width > 0, size.height > 0 else {
      return .all
    }
    if alenioHingeKnown || alenioHingeOpen || alenioRotates(size: size) { return .all }
    return .portrait
  }

  static func alenioMask(
    _ mask: UIInterfaceOrientationMask,
    allows orientation: UIInterfaceOrientation
  ) -> Bool {
    mask.contains(UIInterfaceOrientationMask(rawValue: 1 << orientation.rawValue))
  }

  /// How the phone is physically held, as an interface orientation, and only
  /// when that is landscape. Device landscape and interface landscape are
  /// swapped. Nil when the phone is upright, flat, or the reading is missing.
  static func alenioHeldLandscapeMask() -> UIInterfaceOrientationMask? {
    alenioStartOrientationUpdates()
    switch UIDevice.current.orientation {
    case .landscapeLeft:
      return .landscapeRight
    case .landscapeRight:
      return .landscapeLeft
    default:
      return nil
    }
  }

  public override func application(
    _ application: UIApplication,
    supportedInterfaceOrientationsFor window: UIWindow?
  ) -> UIInterfaceOrientationMask {
    return AppDelegate.${MARKER}(for: window)
  }
`;

const SCENE_DELEGATE_BODY = `
  /// Do not request a geometry update here. On iPhone Duo the status bar
  /// already defines upright, and a sensor-based request turns the app
  /// sideways relative to that bar.
  func windowScene(
    _ windowScene: UIWindowScene,
    didUpdate previousCoordinateSpace: UICoordinateSpace,
    interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation,
    traitCollection previousTraitCollection: UITraitCollection
  ) {
    guard let window else { return }
    AppDelegate.alenioAttachHinge(to: window)
    window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
  }
`;

function insertAfter(contents, anchor, body, file) {
  const at = contents.indexOf(anchor);
  if (at === -1) {
    throw new Error(
      `with-foldable-orientation: could not find "${anchor}" in ${file}. ` +
        "The Expo template changed; update the plugin to match.",
    );
  }
  const end = at + anchor.length;
  return contents.slice(0, end) + body + contents.slice(end);
}

module.exports = function withFoldableOrientation(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error(
        "with-foldable-orientation: expected a Swift AppDelegate, got " +
          cfg.modResults.language,
      );
    }
    let contents = cfg.modResults.contents;
    if (!contents.includes("import AlenioHinge")) {
      if (contents.includes("internal import Expo\n")) {
        contents = contents.replace(
          "internal import Expo\n",
          "internal import Expo\ninternal import AlenioHinge\n",
        );
      } else if (contents.includes("import Expo\n")) {
        contents = contents.replace(
          "import Expo\n",
          "import Expo\ninternal import AlenioHinge\n",
        );
      }
    }
    if (contents.includes(MARKER)) {
      contents = contents.replace(
        "if alenioHingeIsKnownClosed { return .landscape }\n    if alenioHingeOpen || alenioRotates(size: size) { return .all }",
        "if alenioHingeKnown || alenioHingeOpen || alenioRotates(size: size) { return .all }",
      );
      cfg.modResults.contents = contents;
      return cfg;
    }

    contents = insertAfter(
      contents,
      APP_DELEGATE_ANCHOR,
      APP_DELEGATE_BODY,
      "AppDelegate.swift",
    );
    // Expo's iOS template may manage scenes without declaring a
    // SceneDelegate in this file. The hinge callback in APP_DELEGATE_BODY is
    // the primary posture signal; add the scene-size fallback only when the
    // template exposes a SceneDelegate extension point.
    if (contents.includes(SCENE_DELEGATE_ANCHOR)) {
      contents = insertAfter(
        contents,
        SCENE_DELEGATE_ANCHOR,
        SCENE_DELEGATE_BODY,
        "AppDelegate.swift",
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
};
