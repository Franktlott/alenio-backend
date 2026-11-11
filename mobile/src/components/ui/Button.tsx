import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, palette, tones } from "@/theme";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Leading icon. Give it the colour from `buttonInk(variant)`. */
  icon?: ReactNode;
  /** Trailing icon, e.g. a chevron on a link. */
  iconRight?: ReactNode;
  iconOnly?: boolean;
  fullWidth?: boolean;
  label?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const HEIGHT: Record<ButtonSize, number> = { sm: 30, md: 38, lg: 48 };
const PAD: Record<ButtonSize, number> = { sm: 11, md: 14, lg: 18 };
const FONT: Record<ButtonSize, number> = { sm: 12.5, md: 14, lg: 15.5 };
const RADIUS: Record<ButtonSize, number> = { sm: 9, md: 12, lg: 14 };

const SURFACE: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: palette.violet,
    shadowColor: palette.violetBright,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  secondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E0EF",
    shadowColor: "#2A1660",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  soft: { backgroundColor: tones.accent.bg },
  ghost: { backgroundColor: "transparent" },
  destructive: { backgroundColor: colors.error },
  link: { backgroundColor: "transparent", paddingHorizontal: 0, minHeight: 0, height: undefined },
};

const INK: Record<ButtonVariant, string> = {
  primary: "#FFFFFF",
  secondary: palette.ink,
  soft: palette.violet,
  ghost: palette.inkSecondary,
  destructive: "#FFFFFF",
  link: palette.violet,
};

/** Text/icon colour for a variant, so icons passed in match the label. */
export function buttonInk(variant: ButtonVariant = "primary") {
  return INK[variant];
}

/** Mirrors web `Button`: one set of variants and sizes for every screen. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  iconOnly = false,
  fullWidth = false,
  label,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const ink = INK[variant];
  const isLink = variant === "link";
  const content = children ?? label;
  const [pressed, setPressed] = useState(false);
  // A static style rather than Pressable's style callback: the NativeWind
  // interop drops callback styles on this component.
  const resolvedStyle = StyleSheet.flatten<ViewStyle>([
    {
      height: isLink ? undefined : HEIGHT[size],
      width: iconOnly ? HEIGHT[size] : undefined,
      paddingHorizontal: iconOnly ? 0 : PAD[size],
      borderRadius: RADIUS[size],
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: fullWidth ? "stretch" : "flex-start",
      gap: isLink ? 2 : 6,
    },
    SURFACE[variant],
    pressed ? { opacity: isLink ? 0.6 : 0.88, transform: [{ scale: 0.98 }] } : null,
    disabled ? { opacity: 0.45 } : null,
    style,
  ]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      hitSlop={isLink ? 8 : undefined}
      style={resolvedStyle}
      {...rest}
      onPressIn={(event) => {
        setPressed(true);
        rest.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        rest.onPressOut?.(event);
      }}
    >
      {loading ? <ActivityIndicator size="small" color={ink} /> : icon ? <View>{icon}</View> : null}
      {iconOnly || content == null ? null : typeof content === "string" ? (
        <Text
          numberOfLines={1}
          style={{ color: ink, fontSize: FONT[size], fontWeight: "700", letterSpacing: -0.1 }}
        >
          {content}
        </Text>
      ) : (
        content
      )}
      {iconRight && !iconOnly ? <View>{iconRight}</View> : null}
    </Pressable>
  );
}
