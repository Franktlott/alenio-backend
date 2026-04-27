import React, { forwardRef } from "react";
import { Platform, ScrollView, TurboModuleRegistry } from "react-native";
import type { ScrollViewProps } from "react-native";
import type {
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
