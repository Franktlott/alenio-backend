import ExpoModulesCore
import UIKit

/**
 * Duo hinge posture via UIHingeInteraction (ObjC observer helper).
 * ReservedRegionsView crashed this app on mount; this only attaches a
 * UIInteraction on the key window / root views and retries until UIKit
 * delivers a real hinge reading.
 */
public class AlenioHingeModule: Module {
  private var observer: AlenioHingeObserver?
  private var retryTimer: Timer?
  private var lastStatus: String = "unknown"
  private var lastAngle: Double?
  private var attachedViewDescription: String = "none"

  public func definition() -> ModuleDefinition {
    Name("AlenioHinge")

    Events("onHingeChange")

    Function("getStatus") { () -> String in
      self.lastStatus
    }

    Function("getAngle") { () -> Double? in
      self.lastAngle
    }

    Function("getDebugInfo") { () -> [String: Any] in
      [
        "status": self.lastStatus,
        "angle": self.lastAngle as Any,
        "attachedView": self.attachedViewDescription,
        "hasObserver": self.observer != nil,
      ]
    }

    // Expo calls these when JS addListener / remove runs for Events(...).
    OnStartObserving {
      DispatchQueue.main.async {
        self.startAttachLoop()
      }
    }

    OnStopObserving {
      DispatchQueue.main.async {
        self.teardown()
      }
    }

    OnDestroy {
      DispatchQueue.main.async {
        self.teardown()
      }
    }
  }

  private func startAttachLoop() {
    attachOnce()
    retryTimer?.invalidate()
    // UIKit may report a nil hinge until the window finishes joining the
    // fold hierarchy; keep re-attaching while we only have "unknown".
    retryTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] timer in
      guard let self else {
        timer.invalidate()
        return
      }
      if self.lastStatus != "unknown" {
        timer.invalidate()
        self.retryTimer = nil
        return
      }
      self.observer?.stop()
      self.observer = nil
      self.attachOnce()
    }
  }

  private func teardown() {
    retryTimer?.invalidate()
    retryTimer = nil
    observer?.stop()
    observer = nil
    attachedViewDescription = "none"
  }

  private func attachOnce() {
    if observer != nil { return }
    guard let view = Self.preferredView() else {
      attachedViewDescription = "nil"
      return
    }
    attachedViewDescription = String(describing: type(of: view))
    let next = AlenioHingeObserver()
    next.start(on: view) { [weak self] (status: String, angle: NSNumber?) in
      guard let self else { return }
      // Ignore nil-hierarchy "unknown" flaps once we already have a real status.
      if status == "unknown", self.lastStatus != "unknown", angle == nil {
        self.observer?.stop()
        self.observer = nil
        self.startAttachLoop()
        return
      }
      self.lastStatus = status
      self.lastAngle = angle?.doubleValue
      self.sendEvent(
        "onHingeChange",
        [
          "status": status,
          "angle": self.lastAngle as Any,
          "attachedView": self.attachedViewDescription,
        ]
      )
    }
    observer = next
  }

  private static func preferredView() -> UIView? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    // Prefer the key window itself — UIHingeInteraction needs a view in the
    // display hierarchy that owns the fold; RCT's nested roots sometimes don't.
    for scene in scenes {
      if let key = scene.windows.first(where: { $0.isKeyWindow }) {
        return key
      }
    }
    for scene in scenes {
      if let window = scene.windows.first {
        return window
      }
    }
    return nil
  }
}
