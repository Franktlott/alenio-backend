import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { tints } from "@/theme";

export type TintName = keyof typeof tints;

/** Rounded tinted square behind a section or row icon. */
export function IconTile({
  tint = "lavender",
  size = 32,
  children,
  style,
}: {
  tint?: TintName;
  size?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.31),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tints[tint].bg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Icon colour that goes with a tile tint. */
export function tintInk(tint: TintName = "lavender") {
  return tints[tint].fg;
}
