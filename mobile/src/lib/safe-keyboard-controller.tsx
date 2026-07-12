import React, { forwardRef, useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  ScrollView,
  TurboModuleRegistry,
  View,
} from "react-native";
import type { ScrollViewProps } from "react-native";
import type {
  KeyboardAvoidingViewProps as LibKeyboardAvoidingViewProps,
  KeyboardAwareScrollViewProps,
  KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";

/**
 * True when the native KeyboardController module is compiled into the app.
 * Expo Go omits it — avoid importing the library at all there so Metro never executes its native stubs.
 * On web the package uses no-op bindings.
 */
function isKeyboardControllerLinked(): boolean {
  if (Platform.OS === "web") {
    return true;
  }
  return TurboModuleRegistry.get("KeyboardController") != null;
}

const LINKED = isKeyboardControllerLinked();

export function SafeKeyboardProvider({ children }: { children: React.ReactNode }) {
  if (!LINKED) {
    return <>{children}</>;
  }
  // Lazy require so Expo Go never loads/evaluates react-native-keyboard-controller.
  const { KeyboardProvider } = require("react-native-keyboard-controller") as typeof import("react-native-keyboard-controller");
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export type SafeKeyboardAvoidingViewProps = LibKeyboardAvoidingViewProps;

/**
 * Uses react-native-keyboard-controller on dev builds (KeyboardProvider present).
 * RN's KeyboardAvoidingView does nothing on Android when behavior is undefined; the
 * library's view applies padding from native keyboard frames on both platforms.
 */
function rnKeyboardAvoidingBehavior(
  behavior: SafeKeyboardAvoidingViewProps["behavior"],
): "padding" | "height" | "position" | undefined {
  if (Platform.OS !== "ios") return undefined;
  if (behavior === "height" || behavior === "position" || behavior === "padding") return behavior;
  return "padding";
}

/** True while the software keyboard is visible (for composer safe-area padding). */
export function useSafeKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return visible;
}

export const SafeKeyboardAvoidingView = forwardRef(function SafeKeyboardAvoidingView(
  {
    behavior = "padding",
    enabled,
    automaticOffset,
    keyboardVerticalOffset,
    ...rest
  }: SafeKeyboardAvoidingViewProps,
  ref: React.ForwardedRef<View>,
) {
  if (!LINKED) {
    // RN KAV has no automaticOffset; keep any manual offset the caller passed (Expo Go).
    return (
      <RNKeyboardAvoidingView
        ref={ref as never}
        behavior={rnKeyboardAvoidingBehavior(behavior)}
        enabled={enabled}
        keyboardVerticalOffset={keyboardVerticalOffset}
        {...rest}
      />
    );
  }
  const { KeyboardAvoidingView: LibKAV } =
    require("react-native-keyboard-controller") as typeof import("react-native-keyboard-controller");
  // With automaticOffset, RN-style header compensation is harmful (becomes additive gap).
  const libOffset = automaticOffset ? 0 : keyboardVerticalOffset;
  const libProps = {
    behavior,
    enabled,
    automaticOffset,
    keyboardVerticalOffset: libOffset,
    ...rest,
  } as LibKeyboardAvoidingViewProps;
  return <LibKAV ref={ref as never} {...libProps} />;
});

const LIB_ONLY_KEYS = [
  "bottomOffset",
  "disableScrollOnKeyboardHide",
  "enabled",
  "extraKeyboardSpace",
  "ScrollViewComponent",
] as const;

function stripLibOnlyProps(props: KeyboardAwareScrollViewProps): ScrollViewProps {
  const next = { ...props } as Record<string, unknown>;
  for (const key of LIB_ONLY_KEYS) {
    delete next[key];
  }
  return next as ScrollViewProps;
}

export const SafeKeyboardAwareScrollView = forwardRef<
  KeyboardAwareScrollViewRef,
  KeyboardAwareScrollViewProps
>(function SafeKeyboardAwareScrollView(props, ref) {
  if (!LINKED) {
    return (
      <ScrollView
        ref={ref as unknown as React.Ref<ScrollView>}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        {...stripLibOnlyProps(props)}
      />
    );
  }
  const { KeyboardAwareScrollView: KASV } =
    require("react-native-keyboard-controller") as typeof import("react-native-keyboard-controller");
  return <KASV ref={ref} {...props} />;
});
