import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Activity, Plus } from "lucide-react-native";
import { HEADER_BUTTON_HIT_SLOP, HEADER_LIGHT_ICON_COLOR } from "@/lib/header-brand";

export function HeaderActionPill({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "brand" | "light";
}) {
  return (
    <View
      style={[styles.pill, tone === "light" ? styles.pillLight : styles.pillBrand]}
      testID="header-action-pill"
    >
      {children}
    </View>
  );
}

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
  tone?: "brand" | "light";
  size?: "default" | "large";
};

/** Compact circular + for AppTabHeader rightAction (Chat / Team / Workspace). */
export function HeaderAddButton({
  onPress,
  accessibilityLabel,
  testID,
  tone = "brand",
  size = "large",
}: Props) {
  const large = size === "large";

  return (
    <Pressable
      onPress={onPress}
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      style={({ pressed }) => [
        styles.button,
        large ? styles.buttonLarge : null,
        tone === "light" ? styles.buttonLight : null,
        pressed ? (tone === "light" ? styles.pressedLight : styles.pressed) : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Plus
        size={large ? 21 : 17}
        color={tone === "light" ? HEADER_LIGHT_ICON_COLOR : "white"}
        strokeWidth={2.25}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    paddingHorizontal: 6,
    gap: 10,
    borderRadius: 20,
    overflow: "visible",
  },
  pillLight: {
    backgroundColor: "transparent",
  },
  pillBrand: {
    backgroundColor: "rgba(255,255,255,0.20)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  buttonLarge: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  pressed: {
    opacity: 0.7,
  },
  buttonLight: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  pressedLight: {
    opacity: 0.7,
  },
});

type PulseProps = {
  attentionCount?: number;
  onPress: () => void;
  tone?: "brand" | "light";
};

export function WorkspacePulseHeaderButton({
  attentionCount = 0,
  onPress,
  tone = "brand",
}: PulseProps) {
  const badgeLabel = attentionCount > 9 ? "9+" : String(attentionCount);
  const accessibilityLabel =
    attentionCount > 0
      ? `Workplace Pulse, ${attentionCount} needing attention`
      : "Workplace Pulse";

  return (
    <Pressable
      onPress={onPress}
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      style={({ pressed }) => [
        styles.button,
        styles.buttonLarge,
        tone === "light" ? styles.buttonLight : null,
        pressed ? (tone === "light" ? styles.pressedLight : styles.pressed) : null,
        pulseStyles.button,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID="workspace-pulse-header-button"
    >
      <Activity
        size={19}
        color={tone === "light" ? HEADER_LIGHT_ICON_COLOR : "white"}
        strokeWidth={2.25}
      />
      {attentionCount > 0 ? (
        <View style={pulseStyles.badge} testID="workspace-pulse-header-badge">
          <Text style={pulseStyles.badgeText}>{badgeLabel}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const pulseStyles = StyleSheet.create({
  button: {
    flexShrink: 0,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -1,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5B45FF",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
