import React from "react";
import { View } from "react-native";
import { Users } from "lucide-react-native";

type Props = {
  size?: number;
  /** Circle for team edit; rounded square for workspace edit. */
  shape?: "circle" | "rounded";
  testID?: string;
};

/**
 * Empty-state mark for workspace/team photos — reads as a group, not a blank disc.
 */
export function WorkspacePhotoPlaceholder({
  size = 96,
  shape = "circle",
  testID,
}: Props) {
  const radius = shape === "circle" ? size / 2 : Math.max(12, Math.round(size * 0.22));
  const iconSize = Math.round(size * 0.4);
  const disc = Math.round(size * 0.56);

  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: "#EEF2FF",
        borderWidth: 1,
        borderColor: "#C7D2FE",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -size * 0.18,
          left: -size * 0.12,
          width: size * 0.68,
          height: size * 0.68,
          borderRadius: size,
          backgroundColor: "rgba(99, 102, 241, 0.14)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -size * 0.22,
          right: -size * 0.16,
          width: size * 0.72,
          height: size * 0.72,
          borderRadius: size,
          backgroundColor: "rgba(67, 97, 238, 0.12)",
        }}
      />
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          backgroundColor: "rgba(255,255,255,0.85)",
          borderWidth: 1,
          borderColor: "rgba(199, 210, 254, 0.95)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Users size={iconSize} color="#4361EE" strokeWidth={2.15} />
      </View>
    </View>
  );
}
