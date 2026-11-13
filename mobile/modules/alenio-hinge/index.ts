import { requireNativeModule, type EventSubscription } from "expo-modules-core";

export type HingeStatus = "unknown" | "closed" | "partiallyOpen" | "fullyOpen";

export type HingeChangeEvent = {
  status: HingeStatus;
  /** Radians when available; otherwise null. */
  angle: number | null;
  attachedView?: string;
};

type AlenioHingeNativeModule = {
  getStatus(): HingeStatus;
  getAngle(): number | null;
  getDebugInfo(): {
    status: HingeStatus;
    angle: number | null;
    attachedView: string;
    hasObserver: boolean;
  };
  addListener(
    eventName: "onHingeChange",
    listener: (event: HingeChangeEvent) => void,
  ): EventSubscription;
};

function getNative(): AlenioHingeNativeModule | null {
  try {
    return requireNativeModule<AlenioHingeNativeModule>("AlenioHinge");
  } catch {
    return null;
  }
}

export function getHingeStatus(): HingeStatus {
  try {
    return getNative()?.getStatus() ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function getHingeAngle(): number | null {
  try {
    return getNative()?.getAngle() ?? null;
  } catch {
    return null;
  }
}

export function getHingeDebugInfo(): Record<string, unknown> | null {
  try {
    return getNative()?.getDebugInfo() ?? null;
  } catch {
    return null;
  }
}

/** Subscribing starts native observation (Expo OnStartObserving). */
export function addHingeChangeListener(
  listener: (event: HingeChangeEvent) => void,
): EventSubscription | null {
  const native = getNative();
  if (!native) return null;
  return native.addListener("onHingeChange", listener);
}
