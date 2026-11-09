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

  /// Portrait on a phone-sized display, free rotation once it is big enough.
  /// The scene's coordinate space is preferred over window.bounds, which can
  /// still be the folded size during the update that announces the unfold.
  static func ${MARKER}(for window: UIWindow?) -> UIInterfaceOrientationMask {
    alenioStartOrientationUpdates()
    let size = window?.windowScene?.coordinateSpace.bounds.size ?? window?.bounds.size
    guard let size, size.width > 0, size.height > 0 else {
      return .portrait
    }
    return alenioRotates(size: size) ? .all : .portrait
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
  /// Folding changes the window size without turning the device, so UIKit has
  /// no reason to re-ask on its own. When the display shrinks below the
  /// rotation threshold, pull the interface back to portrait. When it opens up
  /// while the phone is already on its side, turn to match — asking for "all"
  /// only permits landscape, and the screen stays portrait until the next turn.
  func windowScene(
    _ windowScene: UIWindowScene,
    didUpdate previousCoordinateSpace: UICoordinateSpace,
    interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation,
    traitCollection previousTraitCollection: UITraitCollection
  ) {
    guard let window else { return }
    guard #available(iOS 16.0, *) else { return }

    window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()

    let openedUp = !AppDelegate.alenioRotates(size: previousCoordinateSpace.bounds.size)
      && AppDelegate.alenioRotates(size: windowScene.coordinateSpace.bounds.size)

    if openedUp, let catchUp = AppDelegate.alenioHeldLandscapeMask() {
      // This callback is itself a geometry update, and a second request made
      // from inside it is rejected. Waiting one turn also lets the supported
      // set include landscape before we ask to turn.
      DispatchQueue.main.async {
        window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: catchUp)) { error in
          NSLog("[orientation] unfold catch-up failed: %@", error.localizedDescription)
        }
      }
      return
    }

    let mask = AppDelegate.${MARKER}(for: window)
    let current = windowScene.effectiveGeometry.interfaceOrientation
    if !AppDelegate.alenioMask(mask, allows: current) {
      windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: mask))
    }
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
    if (cfg.modResults.contents.includes(MARKER)) return cfg;

    let contents = insertAfter(
      cfg.modResults.contents,
      APP_DELEGATE_ANCHOR,
      APP_DELEGATE_BODY,
      "AppDelegate.swift",
    );
    contents = insertAfter(
      contents,
      SCENE_DELEGATE_ANCHOR,
      SCENE_DELEGATE_BODY,
      "AppDelegate.swift",
    );
    cfg.modResults.contents = contents;
    return cfg;
  });
};
