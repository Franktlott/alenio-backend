import type { ComponentType } from "react";
import { View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

type TabIconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type Props = {
  Icon: TabIconComponent;
  size: number;
  active: boolean;
  inactiveColor: string;
};

export function GradientTabIcon({
  Icon,
  size,
  active,
  inactiveColor,
}: Props) {
  if (!active) {
    return (
      <Icon
        size={size}
        color={inactiveColor}
        strokeWidth={1.8}
      />
    );
  }

  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <View style={{ width: size, height: size }}>
          <Icon size={size} color="#000000" strokeWidth={2.5} />
        </View>
      }
    >
      <LinearGradient
        colors={["#2563EB", "#6366F1", "#8B5CF6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: size, height: size }}
      />
    </MaskedView>
  );
}
